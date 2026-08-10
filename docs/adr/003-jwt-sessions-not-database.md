# ADR-003: JWT sessions over database sessions

**Status:** Accepted (updated 2025-01 — JWT denylist implemented)

## Context

NextAuth supports two session strategies:
1. **Database sessions**: Session token stored in DB, looked up per request
2. **JWT sessions**: Session data encoded in JWT, verified per request (no DB lookup)

The Credentials provider requires JWT strategy (NextAuth constraint).

## Decision

Use **JWT sessions** with the following design:
- JWT contains: `userId`, `tenantId`, `email`, `roles`, `permissions`, `mfaVerified`, `jti`, `iat`, `exp`
- Permissions are refreshed every 5 minutes (via `jwt` callback)
- Session expires after 8 hours
- Step-up auth uses separate short-lived tokens (5 min)
- **JWT denylist** (implemented): every JWT includes a unique `jti` (JWT ID);
  on logout or admin revocation, the `jti` is added to the `RevokedSession`
  table. The auth handler checks every request against this denylist.

## Consequences

### Positive
- No DB lookup per request for valid tokens (faster than DB sessions)
- Works with Credentials provider (required for email + password)
- Easy to scale horizontally (stateless for the common case)
- Step-up auth is cleanly separated
- **Immediate revocation** via JWT denylist (single-session + mass-revoke)

### Negative
- One DB lookup per request for the denylist check (mitigated by 60s cache)
- Role changes take up to 5 minutes to propagate (permission refresh window)
- Denylist grows over time (mitigated by GC cron that deletes expired rows)

## Revocation mechanism (implemented)

Two layers of revocation:

1. **Single-session revocation** (`RevokedSession` table):
   - On logout: the JWT's `jti` is added to `RevokedSession` with its natural
     expiry (`exp` claim). The auth handler checks `isSessionRevoked(jti)` on
     every request (cached for 60s for valid JTIs; revoked JTIs are never
     cached so revocation takes effect immediately).
   - `/api/auth/logout` endpoint revokes the current session's JWT.
   - GC cron deletes expired rows.

2. **Mass-revocation** (`User.sessionsRevokedAt` timestamp):
   - On password change: `sessionsRevokedAt` is set to `now()`. Any JWT
     with `iat < sessionsRevokedAt` is rejected.
   - `/api/sessions` DELETE endpoint triggers mass-revocation for the
     current user.
   - Cached for 60s per user; cache is invalidated on revocation.

### Performance
- Valid-JTI cache hit: 0 DB lookups (60s TTL)
- Cache miss: 1 DB lookup (`RevokedSession.findUnique` by `jti` — indexed)
- Mass-revoke check: 1 DB lookup (`User.findUnique` for `sessionsRevokedAt`) —
  cached for 60s per user
- For higher scale: move both caches to Redis with TTLs matching JWT expiry.

## Mitigations
- Password change → `revokeAllUserSessions()` invalidates all JWTs immediately
- User suspension → next JWT refresh detects `status !== 'active'` and throws
- Admin force-logout → `DELETE /api/sessions` revokes all user sessions
- Stolen token → user can trigger revocation via password change or session revoke

## Alternatives considered

- **Database sessions**: Instant revocation without denylist, but adds DB
  lookup per request for EVERY session (not just revocation check) + doesn't
  work with Credentials provider. The JWT denylist approach adds a lookup
  only for the revocation check (cached 60s), which is cheaper.
- **Refresh token rotation**: More secure for SPAs, but adds complexity and
  doesn't solve the immediate-revocation problem (refresh tokens can also
  be stolen).
- **Rotating NEXTAUTH_SECRET**: Nuclear option — revokes ALL sessions across
  ALL tenants. Only suitable for incident response, not routine revocation.
