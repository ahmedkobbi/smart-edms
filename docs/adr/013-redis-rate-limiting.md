# ADR-013: Redis-Backed Rate Limiting + Challenge Stores

## Status
Accepted

## Date
2026-08-10

## Context

The original rate limiters (`authRateLimiter`, `apiRateLimiter`, `uploadRateLimiter`) and challenge/state stores (SSO state, MFA pending, passkey challenges) were all in-process `Map`s. In a multi-instance production deployment (PM2 cluster, Kubernetes replicas, serverless cold starts), each instance had its own bucket:

- **Rate limits**: an attacker rotating across N instances gets N× the configured limit. A credential-stuffing attack from a 1 000-IP botnet against a 3-instance deploy gets 30 000 attempts/hour per email instead of the intended 20.
- **Challenge stores**: the SSO state issued by instance A is invisible to instance B handling the callback. Legitimate SSO/MFA/passkey logins fail ~50% of the time on a 2-instance deploy.

The pentest report flagged this as M-AUTH-17 (MEDIUM) and L-INFRA-10 (LOW).

## Decision

Implement a hybrid backend pattern for both rate limiters and challenge stores:

### Rate Limiter (`src/lib/security/rate-limit.ts`)
- **Redis backend** (when `REDIS_URL` is set + reachable): sorted-set sliding window using `ZADD` + `ZREMRANGEBYSCORE` + `ZCARD` + `PEXPIRE` in a single `MULTI` pipeline (atomic, 1 round-trip). Denied requests are removed from the set so they don't permanently saturate the window.
- **In-memory fallback** (dev / single-instance): sliding window of timestamps in a `Map`.
- **Auto-failover**: re-checks Redis availability every 30s. Mid-call Redis errors fall through to memory.

### Challenge Store (`src/lib/auth/challenge-store.ts`)
- **Redis backend**: `SET key value PX ttl` with namespace prefix `smart-edms:challenge:<ns>:`.
- **In-memory fallback**: `Map` with 10 000-entry LRU cap + 60s GC sweep.
- **Auto-failover**: same pattern as rate limiter.

## Consequences

**Positive:**
- Rate limits enforced globally across all instances — credential stuffing bounded to 20/hour per email regardless of instance count.
- SSO/MFA/passkey flows work correctly in multi-instance deploys.
- Graceful degradation: Redis outage → fallback to in-memory (flows still work, just not multi-instance safe until Redis recovers).
- 30s fail-back window — no manual intervention needed after Redis recovery.

**Negative:**
- `check()` is now `async` — all 13 call sites required migration to `await`.
- Redis adds ~1-3ms latency per rate-limited request (single `MULTI` pipeline).
- The in-memory fallback is not multi-instance safe — operators must ensure Redis is configured in production.

## Alternatives Considered

1. **Token bucket in Redis** — more complex, no advantage over sorted-set for our use case.
2. **Always in-memory + sticky sessions** — requires load balancer configuration, doesn't solve rate limiting.
3. **Database-backed limiter** — too slow for per-request checks.
