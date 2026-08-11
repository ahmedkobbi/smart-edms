# ADR-018: E-Signature Integration (DocuSign / Adobe Sign)

## Status

Accepted

## Date

2026-08-11

## Context

Enterprise EDMS deployments require electronic signature integration for:
- Contract execution
- Policy acknowledgment
- Approval routing with legal validity
- Audit-trail-attributed sign-offs

The two market-leading providers are **DocuSign** and **Adobe Sign**. Both
support:
- Server-to-server JWT/OAuth authentication
- HMAC-signed webhooks for status updates
- Certificate of completion (legally binding audit trail)

## Decision

Implement a **unified signature service** with a provider abstraction layer:

### 1. Provider abstraction
- `SignatureProvider` type: `'docusign' | 'adobe_sign' | 'internal'`
- `getDefaultProvider()` auto-detects based on configured env vars
- Each provider implements: `createEnvelope()`, `getSigningUrl()`, `voidEnvelope()`
- **Internal provider** fallback for non-configured deployments (in-app signing page)

### 2. Authentication
- **DocuSign**: JWT grant with RS256 signature (no client secret — private key only)
- **Adobe Sign**: OAuth client credentials grant
- Tokens cached with 5-minute refresh buffer

### 3. Webhook security
- HMAC-SHA256 signature verification (timing-safe comparison)
- `DOCUSIGN_WEBHOOK_SECRET` env var required for verification
- Unverified webhooks are rejected with 401 (never processed)
- All webhook events stored in `SignatureEnvelope` model for replay protection

### 4. Audit trail
- Every signature event recorded in the hash-chained audit log
- Per-request audit trail (JSON array of events)
- Notification to initiator on completion

### 5. SSRF protection
- All outbound API calls go through `ssrfSafeFetch` (DNS pinning via undici)
- No user-controlled URLs reach the provider APIs

## Consequences

### Positive
- One API surface for all providers (easy to add new ones)
- No API keys exposed to the client (all calls server-side)
- Webhook verification prevents forged status updates
- SSRF protection prevents DNS rebinding attacks

### Negative
- DocuSign JWT requires a private key in env (operational burden — key rotation)
- Webhook endpoints must be internet-reachable (not suitable for air-gapped LAN)
- Internal provider lacks legal validity (for testing only)

## Alternatives Considered

1. **DocuSign only** — too restrictive (some enterprises standardize on Adobe Sign)
2. **Client-side embedding** — exposes API keys, violates zero-client-trust principle
3. **Build our own e-signature** — not legally valid without provider certification
