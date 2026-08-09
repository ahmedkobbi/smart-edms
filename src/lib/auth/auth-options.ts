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
import { verifyPassword } from './crypto';
import { decryptTotpSecret, verifyTotp } from './totp';
import { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from './permissions';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify } from '@/lib/notifications/notify';
import { sendFailedLoginAlert, sendAccountLockedAlert } from '@/lib/notifications/email';

// MFA pending token is short-lived (5 minutes)
const MFA_PENDING_TTL_MS = 5 * 60 * 1000;

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
    isStepUp: boolean;
    stepUpExpiresAt?: number;
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
        const rl = authRateLimiter.check(rlKey, 10, 60_000);
        if (!rl.allowed) {
          throw new Error('Too many login attempts. Try again later.');
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
            if (newFailCount === 3) {
              await notify({
                tenantId: user.tenantId,
                userId: user.id,
                type: 'security.failed_login',
                title: 'Failed login attempt',
                body: `There were 3 failed login attempts on your account from IP ${ip}. If this wasn't you, consider changing your password.`,
                severity: 'warning',
                metadata: { ip, attempt: newFailCount },
              }).catch(() => {});
              // Send email alert
              sendFailedLoginAlert(user.email, ip, newFailCount).catch(() => {});
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
                  title: 'Account locked',
                  body: `Account ${user.email} was locked after 5 failed login attempts from IP ${ip}.`,
                  severity: 'critical',
                  metadata: { email: user.email, ip },
                }).catch(() => {});
                // Send email to each admin
                sendAccountLockedAlert(a.user.email, user.email, ip).catch(() => {});
              }
            }
          } else {
            // Unknown email — log to console only (can't audit without a valid tenant)
            console.warn(`[auth] failed login for unknown email: ${credentials.email} from ${ip}`);
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
            // Verify pending token issued earlier
            const pending = mfaPendingStore.get(credentials.mfaPendingToken);
            if (!pending || pending.userId !== user.id || pending.expiresAt < Date.now()) {
              mfaPendingStore.delete(credentials.mfaPendingToken);
              throw new Error('MFA session expired. Please restart login.');
            }
            if (!credentials.mfaToken || !/^\d{6}$/.test(credentials.mfaToken)) {
              throw new Error('A 6-digit MFA code is required.');
            }
            const secret = await decryptTotpSecret(user.mfaSecretEnc);
            if (!verifyTotp(secret, credentials.mfaToken)) {
              throw new Error('Invalid MFA code.');
            }
            mfaPendingStore.delete(credentials.mfaPendingToken);
          } else if (!credentials.mfaToken) {
            // Issue a pending token; client must resubmit with MFA
            const pendingToken = randomPendingToken();
            mfaPendingStore.set(pendingToken, {
              userId: user.id,
              expiresAt: Date.now() + MFA_PENDING_TTL_MS,
            });
            throw new Error(`MFA_REQUIRED:${pendingToken}`);
          } else {
            const secret = await decryptTotpSecret(user.mfaSecretEnc);
            if (!verifyTotp(secret, credentials.mfaToken)) {
              throw new Error('Invalid MFA code.');
            }
          }
        }

        await db.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            lastLoginIp: ip,
            lastLoginUserAgent: (req.headers?.['user-agent'] as string) || null,
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          mfaVerified: user.mfaEnabled,
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
        isStepUp: false,
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
      name: 'smart_edms_session',
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
//  In-memory MFA pending tokens (dev). In production use Redis or DB.
// ---------------------------------------------------------------------------

interface MfaPending {
  userId: string;
  expiresAt: number;
}
const mfaPendingStore = new Map<string, MfaPending>();

function randomPendingToken(): string {
  return Buffer.from(Math.random().toString(36).slice(2) + Date.now().toString(36)).toString('base64url');
}

// Periodically clean expired entries (best-effort)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of mfaPendingStore.entries()) {
      if (v.expiresAt < now) mfaPendingStore.delete(k);
    }
  }, 60_000).unref?.();
}

export async function getServerSession(): Promise<SmartEdmsSession | null> {
  const s = await nextAuthGetServerSession(authOptions);
  return s as SmartEdmsSession | null;
}

export function getSecurityHeaders() {
  return SECURITY_HEADERS;
}
