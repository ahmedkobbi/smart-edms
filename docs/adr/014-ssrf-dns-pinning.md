# ADR-014: SSRF DNS Pinning via Undici Agent

## Status
Accepted

## Date
2026-08-10

## Context

The SSRF guard (`isSafeOutboundUrl`) resolved DNS to verify the IP was not private, but the actual `fetch()` used the original URL with the hostname. Between the DNS check and the fetch, an attacker controlling the authoritative DNS server could re-bind the hostname to `127.0.0.1` (DNS rebinding TOCTOU):

1. Admin configures webhook URL `https://rebind.attacker.com/x`
2. SSRF check: DNS resolves `rebind.attacker.com` → `1.2.3.4` (public IP, passes check)
3. Attacker re-binds DNS: `rebind.attacker.com` → `127.0.0.1`
4. `fetch()` connects to `127.0.0.1` — internal service receives the webhook payload

This was flagged as L-INFRA-7 (LOW, deferred) and M-ADM-6 (MEDIUM) in the pentest report.

## Decision

Implement `ssrfSafeFetch()` in `src/lib/security/ssrf-safe-fetch.ts` using undici's `Agent` with a custom `connect.lookup` function:

1. **Resolve ONCE**: `dns.lookup(hostname)` → resolved IP
2. **Verify**: `isBlockedHost(resolvedIp)` — reject if private/reserved
3. **Pin**: create an undici `Agent` with `connect.lookup` that ALWAYS returns the pinned IP, regardless of what DNS returns at TCP-connect time
4. **TLS preservation**: for HTTPS, set `connect.servername` to the original hostname so SNI + cert validation work correctly
5. **Cache**: agent cached per (protocol, hostname) for 5 min, then re-resolves (picks up legitimate DNS rotation). Cache invalidated on connection failure.

All outbound fetches to admin-configured URLs (webhooks, SSO token/userInfo endpoints) use `ssrfSafeFetch` instead of bare `fetch()`.

## Consequences

**Positive:**
- DNS rebinding TOCTOU eliminated — even if DNS is re-bound between check and connect, undici's `connect.lookup` returns the pinned IP.
- TLS security preserved — SNI + cert validation use the original hostname.
- Performance: agent is cached for 5 min, so subsequent requests to the same host skip DNS resolution.
- Backward compatible — `ssrfSafeFetch` has the same API as `fetch()`.

**Negative:**
- Adds `undici` as an explicit dependency (was already a transitive dep of Node 18+).
- ~50-200ms cold-start latency per unique hostname (DNS + agent creation). Mitigated by 5-min cache.
- The 5-min cache means legitimate DNS changes take up to 5 min to take effect. Acceptable for our use case (webhook URLs don't change frequently).

## Alternatives Considered

1. **Pin via URL rewrite** (replace hostname with IP in the URL) — breaks TLS SNI + cert validation.
2. **Custom HTTP agent with `lookup` on `http.Agent`** — Node's built-in `http.Agent` doesn't support `connect.lookup` in the same way as undici.
3. **iptables / firewall rules** — infrastructure-level, not application-level; doesn't work in serverless.
