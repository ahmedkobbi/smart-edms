# ADR-003: JWT sessions over database sessions

**Status:** Accepted

## Context

NextAuth supports two session strategies:
1. **Database sessions**: Session token stored in DB, looked up per request
2. **JWT sessions**: Session data encoded in JWT, verified per request (no DB lookup)

The Credentials provider requires JWT strategy (NextAuth constraint).

## Decision

Use **JWT sessions** with the following design:
- JWT contains: `userId`, `tenantId`, `email`, `roles`, `permissions`, `mfaVerified`
- Permissions are refreshed every 5 minutes (via `jwt` callback)
- Session expires after 8 hours
- Step-up auth uses separate short-lived tokens (5 min)

## Consequences

### Positive
- No DB lookup per request (faster)
- Works with Credentials provider (required for email + password)
- Easy to scale horizontally (stateless)
- Step-up auth is cleanly separated

### Negative
- Cannot revoke sessions instantly (must wait for JWT expiry or rotate secret)
- Role changes take up to 5 minutes to propagate (permission refresh window)
- For immediate revocation: change user's password (kills all sessions)

## Mitigations
- Password change → all other sessions invalidated
- User suspension → next JWT refresh detects `status !== 'active'` and throws
- For critical revocation needs: maintain a JWT blacklist (Redis) in future

## Alternatives considered

- **Database sessions**: Instant revocation, but adds DB lookup per request + doesn't work with Credentials provider
- **Refresh token rotation**: More secure for SPAs, but adds complexity
