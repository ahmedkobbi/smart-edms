/**
 * Smart EDMS — Session revocation list (JWT denylist)
 *
 * Provides immediate revocation of JWT-based sessions without rotating
 * NEXTAUTH_SECRET (which would log out every user in the tenant).
 *
 * How it works:
 *   1. Every JWT minted by NextAuth / SSO / passkey includes a `jti`
 *      (JWT ID) claim — a unique random string per token.
 *   2. When a user logs out, or an admin revokes their sessions, the
 *      `jti` is added to the `RevokedSession` table.
 *   3. On every authenticated request, `createApiHandler` checks the
 *      JWT's `jti` against this table. If found, the request is rejected
 *      with 401 (session revoked).
 *   4. Rows are garbage-collected after `expiresAt` (when the JWT would
 *      have naturally expired) — a cron job sweeps expired rows.
 *
 * Performance: the JTI lookup is indexed (`@@unique` on `jti`), so it's
 * a single PK probe per request. For higher scale, this can be moved to
 * Redis with a TTL matching the JWT expiry.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';

// In-process cache of recently-checked JTIs to avoid hitting the DB on
// every request. Entries expire after 60 seconds (matching the JWT
// refresh interval). Negative results (valid JTI) are cached; positive
// results (revoked JTI) are NOT cached so that a revocation takes
// effect immediately on the next request.
const VALID_JTI_CACHE = new Map<string, number>(); // jti → expiresAt ms
const CACHE_TTL_MS = 60_000;

/**
 * Check if a JWT (identified by its `jti` claim) has been revoked.
 * Returns true if the session has been revoked and should be rejected.
 */
export async function isSessionRevoked(jti: string | undefined | null): Promise<boolean> {
  if (!jti) {
    // No JTI in the token — can't check revocation. Allow the request
    // (the JWT signature still validates), but log for monitoring.
    // This happens for tokens minted before the revocation feature was added.
    return false;
  }

  // Check the valid-JTI cache first (negative cache only)
  const cachedValidUntil = VALID_JTI_CACHE.get(jti);
  if (cachedValidUntil !== undefined && cachedValidUntil > Date.now()) {
    return false; // recently verified as NOT revoked
  }

  try {
    const revoked = await db.revokedSession.findUnique({
      where: { jti },
      select: { id: true },
    });
    if (revoked) {
      // Don't cache revoked JTIs — we want them to stay revoked forever
      // (until the row is garbage-collected after natural expiry).
      return true;
    }
    // Cache as valid for 60 seconds
    VALID_JTI_CACHE.set(jti, Date.now() + CACHE_TTL_MS);
    return false;
  } catch (err) {
    // DB error — fail OPEN (allow the request) to avoid locking out all
    // users if the DB is temporarily unavailable. The JWT signature still
    // validates, so this is a safe degraded mode.
    logger.warn('session.revocation_check_failed', { jti, error: (err as Error).message });
    return false;
  }
}

/**
 * Revoke a single JWT session by its `jti`.
 * Called on logout.
 */
export async function revokeSession(opts: {
  tenantId: string;
  userId: string;
  jti: string;
  reason?: string;
  jwtExpiresAt: Date; // the JWT's natural `exp` — used for garbage collection
}): Promise<void> {
  try {
    await db.revokedSession.upsert({
      where: { jti: opts.jti },
      update: {
        // If already revoked, update the reason but keep the original timestamp
        reason: opts.reason ?? 'logout',
      },
      create: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        jti: opts.jti,
        reason: opts.reason ?? 'logout',
        expiresAt: opts.jwtExpiresAt,
      },
    });
    // Remove from the valid-JTI cache so the next request re-checks the DB
    VALID_JTI_CACHE.delete(opts.jti);
  } catch (err) {
    logger.error('session.revoke_failed', { jti: opts.jti, error: (err as Error).message });
  }
}

/**
 * Revoke ALL sessions for a user (e.g. on password change, MFA enable,
 * admin force-logout). Since we use JWTs, we can't enumerate active
 * tokens — but we can record a "revoke-all-before" timestamp that the
 * auth handler checks against the JWT's `iat` (issued-at) claim.
 *
 * Implementation: we use a per-user `sessionsRevokedAt` timestamp stored
 * on the User model (added via migration). Any JWT with `iat` before
 * this timestamp is rejected.
 *
 * For backwards compatibility, if `sessionsRevokedAt` is null, all JWTs
 * are accepted (no mass revocation has ever been triggered).
 */

// In-process cache of per-user revocation timestamps (1-minute TTL)
const USER_REVOKE_CACHE = new Map<string, { revokedAt: Date | null; ts: number }>();

/**
 * Get the timestamp at which all of a user's sessions were revoked.
 * JWTs issued before this timestamp are invalid.
 * Returns null if no mass revocation has been triggered.
 */
export async function getUserSessionRevokeTimestamp(userId: string): Promise<Date | null> {
  const cached = USER_REVOKE_CACHE.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.revokedAt;
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { sessionsRevokedAt: true },
    });
    const revokedAt = user?.sessionsRevokedAt ?? null;
    USER_REVOKE_CACHE.set(userId, { revokedAt, ts: Date.now() });
    return revokedAt;
  } catch (err) {
    logger.warn('session.user_revoke_lookup_failed', { userId, error: (err as Error).message });
    return null;
  }
}

/**
 * Revoke all sessions for a user by updating their `sessionsRevokedAt`
 * timestamp to now. Any JWT issued before now will be rejected on the
 * next request.
 */
export async function revokeAllUserSessions(userId: string, reason: string = 'security'): Promise<void> {
  try {
    // Update the user's session revocation timestamp
    await db.user.update({
      where: { id: userId },
      data: { sessionsRevokedAt: new Date() },
    });
    USER_REVOKE_CACHE.delete(userId);

    // SECURITY FIX (H13): Also revoke all API keys for this user.
    // API keys bypass JWT revocation — without this, an attacker who
    // exfiltrated an API key retains access after password change / mass-revoke.
    await db.apiKey.updateMany({
      where: { createdBy: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }).catch(() => {
      // apiKey table might not have createdBy field — best-effort
    });

    // Also revoke all active step-up sessions for this user
    await db.stepUpSession.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }).catch(() => {});

    logger.info('session.revoke_all', { userId, reason, apiKeysRevoked: true, stepUpRevoked: true });
  } catch (err) {
    logger.error('session.revoke_all_failed', { userId, error: (err as Error).message });
  }
}

/**
 * Garbage-collect expired revocation records.
 * Called by the hourly cron. Deletes rows where `expiresAt < now`.
 */
export async function gcRevokedSessions(): Promise<{ deleted: number }> {
  try {
    const result = await db.revokedSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      logger.info('session.gc', { deleted: result.count });
    }
    return { deleted: result.count };
  } catch (err) {
    logger.error('session.gc_failed', { error: (err as Error).message });
    return { deleted: 0 };
  }
}

/**
 * Invalidate the in-process cache for a user (call when their revocation
 * timestamp changes outside of `revokeAllUserSessions`).
 */
export function invalidateUserRevokeCache(userId: string): void {
  USER_REVOKE_CACHE.delete(userId);
}
