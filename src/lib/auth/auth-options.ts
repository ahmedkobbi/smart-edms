/**
 * Smart EDMS — NextAuth configuration
 *
 * Strategy: Credentials provider with Argon2id password verification +
 * optional TOTP MFA. Sessions are database-backed so they can be revoked.
 *
 * Multi-tenancy: every session carries tenantId; the auth helper layer
 * enforces tenant scoping on every subsequent DB query.
 */

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getServerSession as nextAuthGetServerSession } from 'next-auth';
import { db } from '@/lib/db';
import { verifyPassword, sha256, randomBase64Url } from './crypto';
import { decryptTotpSecret, verifyTotpWithReplay } from './totp';
import { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from './permissions';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify } from '@/lib/notifications/notify';
import { sendFailedLoginAlert, sendAccountLockedAlert, sendNewDeviceAlert } from '@/lib/notifications/email';
import { getUserLocale } from '@/i18n/server-translator';
import { logger } from '@/lib/config/logger';
import { createChallengeStore } from './challenge-store';

// MFA pending token is short-lived (5 minutes)
const MFA_PENDING_TTL_MS = 5 * 60 * 1000;

/**
 * Extract a human-readable device name from a User-Agent string.
 * Examples:
 *   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ... Chrome/120.0"
 *     → "Chrome on macOS"
 *   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Edg/120.0"
 *     → "Edge on Windows"
 *   "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ... Mobile/15E148 Safari/604.1"
 *     → "Safari on iOS"
 */
function extractDeviceName(ua: string): string {
  if (!ua) return 'Unknown device';
  let browser = 'Unknown browser';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/windows nt 10/i.test(ua)) os = 'Windows';
  else if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/linux/i.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
}

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '1; mode=block',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
} as const;

export interface SmartEdmsSession {
  user: {
    id: string;
    tenantId: string;
    email: string;
    name?: string | null;
    image?: string | null;
    roles: string[];
    permissions: string[];
    mfaVerified: boolean;
    /** Forces password change — user can only access /settings */
    mustChangePassword?: boolean;
    isStepUp: boolean;
    stepUpExpiresAt?: number;
    /** JWT ID — used for session revocation. Undefined for API-key auth. */
    jti?: string;
    /** JWT issued-at (unix seconds) — used for mass-revoke checks. */
    iat?: number;
    /** JWT expiry (unix seconds). */
    exp?: number;
  };
  expires: string;
  csrfToken?: string;
}

/**
 * Resolve the effective permissions for a user from their role assignments.
 * System roles grant the baseline permissions defined in the catalogue.
 */
export async function resolveUserPermissions(
  userId: string,
  tenantId: string,
): Promise<string[]> {
  const assignments = await db.roleAssignment.findMany({
    where: { userId, tenantId },
    include: { role: true },
  });

  const perms = new Set<string>();
  for (const a of assignments) {
    const role = a.role;
    if (role.isSystem && SYSTEM_ROLE_PERMISSIONS[role.name]) {
      for (const p of SYSTEM_ROLE_PERMISSIONS[role.name]) perms.add(p);
    }
    // Custom role permissions
    try {
      const custom = JSON.parse(role.permissions || '[]') as string[];
      for (const p of custom) perms.add(p);
    } catch {
      // ignore parse errors
    }
  }
  return Array.from(perms);
}

export async function resolveUserRoles(
  userId: string,
  tenantId: string,
): Promise<string[]> {
  const assignments = await db.roleAssignment.findMany({
    where: { userId, tenantId },
    include: { role: true },
  });
  return assignments.map((a) => a.role.name);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Smart EDMS',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        mfaToken: { label: 'MFA Token', type: 'text' },
        mfaPendingToken: { label: 'MFA Pending Token', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const ip =
          (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          (req.headers?.['x-real-ip'] as string) ||
          'unknown';

        // Rate-limit by IP+email to mitigate brute force
        const rlKey = `login:${ip}:${credentials.email.toLowerCase()}`;
        const rl = await authRateLimiter.check(rlKey, 10, 60_000);
        if (!rl.allowed) {
          throw new Error('Too many login attempts. Try again later.');
        }

        // SECURITY FIX (M-AUTH-14): Per-email global rate limit.
        // The (ip, email) limiter above is trivially bypassed by an attacker
        // rotating across many IPs (botnet, residential proxies, Tor) — each
        // IP gets its own 10-attempt budget. This second limiter, keyed on
        // email alone, caps total attempts across all IPs to 20/hour, which
        // makes large-scale credential stuffing infeasible without
        // sacrificing too many legitimate users sharing an IP.
        const emailRlKey = `login-email:${credentials.email.toLowerCase()}`;
        const emailRl = await authRateLimiter.check(emailRlKey, 20, 60 * 60 * 1000);
        if (!emailRl.allowed) {
          throw new Error('Too many login attempts for this account. Try again later.');
        }

        const user = await db.user.findFirst({
          where: {
            email: credentials.email.toLowerCase(),
            tenant: { status: 'active' },
          },
          include: { tenant: true },
        });

        // Always run a password verification to keep timing similar
        const passwordOk = user?.passwordHash
          ? await verifyPassword(credentials.password, user.passwordHash)
          : await verifyPassword(credentials.password, '$argon2id$v=19$m=19456,t=2,p=1$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid$abcdefghijklmnopqrstuvwxyz');

        if (!user || !passwordOk) {
          if (user) {
            const newFailCount = user.failedLoginAttempts + 1;
            await db.user.update({
              where: { id: user.id },
              data: {
                failedLoginAttempts: { increment: 1 },
                lockedUntil:
                  newFailCount >= 5
                    ? new Date(Date.now() + 15 * 60 * 1000)
                    : undefined,
              },
            });

            // Audit the failed login
            await recordAuditEvent({
              tenantId: user.tenantId,
              eventType: 'auth.login',
              action: 'login',
              resourceType: 'user',
              resourceId: user.id,
              resourceName: user.email,
              result: 'deny',
              reason: 'invalid_password',
              actorEmail: user.email,
              actorIp: ip,
              actorUserAgent: (req.headers?.['user-agent'] as string) || null,
              metadata: { attempt: newFailCount, locked: newFailCount >= 5 },
            }).catch(() => {});

            // Notify user on 3rd failure + tenant admins on 5th
            // Pass count + ip in metadata so notify() can localize per recipient.
            if (newFailCount === 3) {
              const userLocale = await getUserLocale(user.id).catch(() => 'en' as const);
              await notify({
                tenantId: user.tenantId,
                userId: user.id,
                type: 'security.failed_login',
                severity: 'warning',
                metadata: { ip, count: newFailCount },
              }).catch(() => {});
              // Send email alert — localized to the user's preferred locale
              sendFailedLoginAlert({
                to: user.email,
                ip,
                attemptCount: newFailCount,
                locale: userLocale,
              }).catch(() => {});
            }
            if (newFailCount >= 5) {
              const admins = await db.roleAssignment.findMany({
                where: { tenantId: user.tenantId, role: { name: SYSTEM_ROLES.TENANT_ADMIN } },
                select: { userId: true, user: { select: { email: true } } },
              });
              for (const a of admins) {
                await notify({
                  tenantId: user.tenantId,
                  userId: a.userId,
                  type: 'security.account_locked',
                  severity: 'critical',
                  metadata: { email: user.email, ip },
                }).catch(() => {});
                // Send email to each admin — localized to the admin's preferred locale
                const adminLocale = await getUserLocale(a.userId).catch(() => 'en' as const);
                sendAccountLockedAlert({
                  to: a.user.email,
                  email: user.email,
                  ip,
                  locale: adminLocale,
                }).catch(() => {});
              }
            }
          } else {
            // Unknown email — log to console only (can't audit without a valid tenant)
            // SECURITY FIX (L-AUTH-6): Use the structured logger (which
            // redacts PII) instead of console.warn (which doesn't). Drop
            // the user-supplied email entirely — if forensics need it, the
            // truncated prefix `email.slice(0,2) + '***'` is enough to
            // correlate with audit events without leaking the full address
            // to SIEM ingesting container stdout.
            logger.info('auth.failed_login_unknown_email', {
              ip,
              emailPrefix: credentials.email.slice(0, 2) + '***',
            });
          }
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('Account temporarily locked. Try again later.');
        }

        if (user.status !== 'active') {
          throw new Error('Account is not active.');
        }

        // Reset failed attempts
        if (user.failedLoginAttempts > 0) {
          await db.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          });
        }

        // MFA check
        if (user.mfaEnabled && user.mfaSecretEnc) {
          // Two paths: pending token (already passed password) or full token
          if (credentials.mfaPendingToken) {
            // SECURITY FIX (M-AUTH-17): mfaPendingStore is now async (Redis-backed).
            const pending = await mfaPendingStore.get(credentials.mfaPendingToken);
            if (!pending || pending.userId !== user.id) {
              await mfaPendingStore.delete(credentials.mfaPendingToken).catch(() => {});
              throw new Error('MFA session expired. Please restart login.');
            }
            if (!credentials.mfaToken || !/^\d{6}$/.test(credentials.mfaToken)) {
              throw new Error('A 6-digit MFA code is required.');
            }
            const secret = await decryptTotpSecret(user.mfaSecretEnc);
            // SECURITY FIX (C6): Use verifyTotpWithReplay for replay protection
            const newTimestep = verifyTotpWithReplay(secret, credentials.mfaToken, user.mfaLastTimestep ?? null);
            if (newTimestep === null) {
              throw new Error('Invalid MFA code.');
            }
            // Persist the new timestep to prevent replay
            await db.user.update({ where: { id: user.id }, data: { mfaLastTimestep: newTimestep } });
            await mfaPendingStore.delete(credentials.mfaPendingToken).catch(() => {});
          } else if (!credentials.mfaToken) {
            // Issue a pending token; client must resubmit with MFA
            const pendingToken = randomPendingToken();
            await mfaPendingStore.set(pendingToken, {
              userId: user.id,
            }, MFA_PENDING_TTL_MS);
            throw new Error(`MFA_REQUIRED:${pendingToken}`);
          } else {
            const secret = await decryptTotpSecret(user.mfaSecretEnc);
            // SECURITY FIX (C6): Use verifyTotpWithReplay for replay protection
            const newTimestep = verifyTotpWithReplay(secret, credentials.mfaToken, user.mfaLastTimestep ?? null);
            if (newTimestep === null) {
              throw new Error('Invalid MFA code.');
            }
            // Persist the new timestep to prevent replay
            await db.user.update({ where: { id: user.id }, data: { mfaLastTimestep: newTimestep } });
          }
        }

        await db.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            lastLoginIp: ip,
            lastLoginUserAgent: (req.headers?.['user-agent'] as string) || null,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        // Record the device (upsert by userId + userAgent hash)
        // This populates the Device table for the admin device-management UI
        // and enables device-trust awareness (§9.1 requirement).
        try {
          const userAgent = (req.headers?.['user-agent'] as string) || 'unknown';
          const deviceHash = sha256(`${user.id}|${userAgent}`).slice(0, 32);
          // SECURITY FIX (L-AUTH-9): Capture whether this is a NEW device so
          // we can notify the user. Previously the upsert result was discarded
          // and the user had no way to learn about unfamiliar-device access
          // until they manually reviewed the device list.
          const existingDevice = await db.device.findUnique({ where: { deviceHash }, select: { id: true } });
          await db.device.upsert({
            where: { deviceHash },
            update: {
              lastSeenAt: new Date(),
              lastIp: ip,
            },
            create: {
              tenantId: user.tenantId,
              userId: user.id,
              deviceHash,
              userAgent,
              name: extractDeviceName(userAgent),
              trusted: false, // new devices start untrusted; admin can mark trusted
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
              lastIp: ip,
            },
          });

          // If this is a new device, notify the user (in-app + email)
          if (!existingDevice) {
            const deviceName = extractDeviceName(userAgent);
            const userLocale = await getUserLocale(user.id).catch(() => 'en' as const);
            await notify({
              tenantId: user.tenantId,
              userId: user.id,
              type: 'security.new_device',
              severity: 'info',
              metadata: { device: deviceName, ip },
            }).catch(() => {});
            sendNewDeviceAlert({
              to: user.email,
              deviceName,
              ip,
              locale: userLocale,
            }).catch(() => {});
          }
        } catch (err) {
          // Device recording is best-effort — don't block login on it
          logger.warn('auth.device_record_failed', { error: (err as Error).message });
        }

        // Concurrent session limit: track recent logins, alert if too many
        const recentLogins = await db.auditEvent.count({
          where: {
            tenantId: user.tenantId,
            actorId: user.id,
            eventType: 'auth.login',
            result: 'allow',
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // last hour
          },
        });
        if (recentLogins > 10) {
          // Anomaly: too many concurrent sessions.
          // For >20 logins/hour, BLOCK the login (potential credential
          // stuffing or session-sharing attack). For 11-20, warn only.
          const shouldBlock = recentLogins > 20;

          await recordAuditEvent({
            tenantId: user.tenantId,
            actorId: user.id,
            actorEmail: user.email,
            actorIp: ip,
            actorUserAgent: (req.headers?.['user-agent'] as string) || null,
            correlationId: undefined,
            eventType: 'auth.concurrent_session_warning',
            action: 'login',
            resourceType: 'user',
            resourceId: user.id,
            resourceName: user.email,
            result: shouldBlock ? 'deny' : 'allow',
            reason: shouldBlock
              ? `Blocked: ${recentLogins} logins in the last hour (concurrent session limit exceeded)`
              : `${recentLogins} logins in the last hour`,
            metadata: { count: recentLogins, blocked: shouldBlock },
          }).catch(() => {});

          if (shouldBlock) {
            // Revoke all existing sessions to break the attack pattern
            const { revokeAllUserSessions } = await import('@/lib/auth/session-revocation');
            await revokeAllUserSessions(user.id, 'concurrent_session_limit');
            throw new Error('Too many concurrent sessions. All sessions have been revoked for security. Please sign in again.');
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          mfaVerified: user.mfaEnabled,
          mustChangePassword: (user as any).mustChangePassword || false,
        } as any;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 30 * 60,
  },
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn(user) {
      return true;
    },
    async jwt({ token, user }: any) {
      // On first sign-in, user is populated by authorize()
      if (user) {
        token.id = user.id;
        token.tenantId = (user as any).tenantId;
        token.mfaVerified = (user as any).mfaVerified;
        token.mustChangePassword = (user as any).mustChangePassword || false;
        const roles = await resolveUserRoles(user.id, (user as any).tenantId);
        const permissions = await resolveUserPermissions(user.id, (user as any).tenantId);
        token.roles = roles;
        token.permissions = permissions;
      }
      // Refresh permissions periodically (in case roles changed)
      if (token.tenantId && (!token.permissions || (token as any).refreshAt < Date.now())) {
        const roles = await resolveUserRoles(token.id as string, token.tenantId as string);
        const permissions = await resolveUserPermissions(token.id as string, token.tenantId as string);
        token.roles = roles;
        token.permissions = permissions;
        (token as any).refreshAt = Date.now() + 5 * 60 * 1000; // refresh every 5 min

        // SECURITY FIX (M-AUTH-2): Refresh `mfaVerified` from the DB so that
        // an admin MFA-reset (which sets `mfaEnabled=false` and revokes
        // sessions) takes effect on the user's NEXT surviving JWT refresh,
        // and so that disabling MFA on the account clears the claim.
        try {
          const u = await db.user.findUnique({
            where: { id: token.id as string },
            select: { mfaEnabled: true, mustChangePassword: true },
          });
          token.mfaVerified = !!(u?.mfaEnabled);
          // Refresh mustChangePassword so admin-forced reset takes effect
          token.mustChangePassword = !!(u?.mustChangePassword);
        } catch {
          // DB error — leave the existing claim in place (fail safe)
        }
      }
      return token;
    },
    async session({ session, token }: any) {
      (session as SmartEdmsSession).user = {
        id: token.id as string,
        tenantId: token.tenantId as string,
        email: token.email as string,
        name: (token.name as string) || null,
        roles: (token.roles as string[]) || [],
        permissions: (token.permissions as string[]) || [],
        mfaVerified: !!token.mfaVerified,
        mustChangePassword: !!token.mustChangePassword,
        isStepUp: false,
        jti: token.jti as string | undefined,
        iat: token.iat as number | undefined,
        exp: token.exp as number | undefined,
      };
      return session;
    },
  },
  events: {
    async signIn(message) {
      // Could log to audit here; for now audit logging is explicit in API routes
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      // SECURITY FIX (H15): Use the standard NextAuth cookie name to match
      // what SSO/passkey/logout handlers set. Previous name 'smart_edms_session'
      // caused SSO/passkey users to have two different session cookies.
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: 'smart_edms_csrf',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
};

// ---------------------------------------------------------------------------
//  MFA pending tokens
// ---------------------------------------------------------------------------
// SECURITY FIX (M-AUTH-17 / L-AUTH-1): Replaced the in-memory `Map` with a
// Redis-backed challenge store (with in-memory fallback for dev). MFA login
// now works in multi-instance deploys. TTL is managed by the store, so the
// periodic sweep is no longer needed.

interface MfaPending {
  userId: string;
}
const mfaPendingStore = createChallengeStore<MfaPending>('mfa-pending');

// SECURITY FIX (H8): Use CSPRNG instead of Math.random()
function randomPendingToken(): string {
  return randomBase64Url(32);
}

export async function getServerSession(): Promise<SmartEdmsSession | null> {
  const s = await nextAuthGetServerSession(authOptions);
  return s as SmartEdmsSession | null;
}

export function getSecurityHeaders() {
  return SECURITY_HEADERS;
}
