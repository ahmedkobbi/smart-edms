# Smart EDMS — Security Architecture

## Overview

Smart EDMS is designed with a **zero-trust, defense-in-depth** security posture. This document describes the security architecture, threat model, and controls.

## Security Principles

1. **Deny by default** — every request requires explicit permission
2. **Least privilege** — roles grant minimum permissions needed
3. **Defense in depth** — multiple independent layers protect data
4. **Audit everything** — every sensitive action is logged tamper-evidently
5. **No custom crypto** — only vetted libraries (Node `crypto`, `argon2`, `pdf-lib`)
6. **Secure failure** — errors fail closed (deny), not open (allow)
7. **Zero client trust** — client-supplied values for security-critical fields (prices, permissions, filenames) are never trusted; the server re-derives from its own state
8. **Webhook-only business logic** — payment/subscription activation runs only in webhook handlers, never on return URLs

---

## Authentication

### Password Authentication
- **Hashing**: Argon2id (memoryCost: 19 MiB, timeCost: 2, parallelism: 1) — OWASP-recommended
- **Password policy**: min 12 chars, must include upper/lower/digit/special
- **Lockout**: 5 failed attempts → 15-min lockout (enforced for password, SSO, and passkey login paths)
- **Rate limiting**: 10 per IP+email per 60s + 20 per email globally per hour (prevents credential stuffing across IP rotation)
- **Notifications**: password change → email alert; new device → email + in-app alert

### Multi-Factor Authentication (MFA)
- **TOTP** (RFC 6238) — 30s period, 6 digits, with replay protection (`mfaLastTimestep` per RFC 6238 §5.2)
- **Secret storage**: AES-256-GCM encrypted with tenant KEK
- **Backup codes**: 10 single-use codes, stored as **SHA-256 hashes** (one-way — not reversibly encrypted)
- **Step-up tokens**: stored as SHA-256 hashes (not plaintext); verified with atomic `updateMany WHERE usedAt=null` (race-safe)
- **Required for**: tenant_admin role (recommended for all)

### Session Management
- **JWT strategy** (stateless, 8h expiry)
- **Cookie**: `httpOnly`, `sameSite=lax`, `secure` in production, `__Secure-` prefix in production
- **Session revocation**: per-JWT denylist (`RevokedSession` table) + per-user `sessionsRevokedAt` timestamp (mass-revoke)
- **Session rotation**: forced on password change, MFA disable, role change, admin suspend, recertification revoke
- **Step-up auth**: 5-min token for privileged actions (verify TOTP or password); tokens hashed at rest
- **API key revocation**: `revokeAllUserSessions()` also revokes all API keys + active step-up tokens
- **mfaVerified claim**: refreshed from DB every 5 min (jwt callback) so admin MFA-reset takes effect on next refresh

### SSO
- **OIDC** and **SAML** provider configuration
- Client secrets AES-256-GCM encrypted
- **PKCE (S256)** on all OIDC flows — prevents authorization-code interception
- **email_verified required** for JIT provisioning — prevents attacker-controlled IdP from creating accounts with arbitrary emails
- **Email domain allowlist** for JIT — only configured domains can auto-provision
- **SAML**: `wantAssertionsSigned: true`, `acceptedClockSkewMs: 60000` (1 min — prevents replay)
- **State store**: Redis-backed (multi-instance safe) with 10-min TTL
- **Lockout enforcement**: SSO login paths check `lockedUntil` (was previously bypassed)

### Passkey / WebAuthn
- **userVerification: 'required'** for both registration and authentication
- **AAGUID allowlist**: tenant-configurable (`settings.security.allowedAaguids`) — restricts which authenticators can be registered
- **Challenge store**: Redis-backed (multi-instance safe) with 5-min TTL
- **Lockout enforcement**: passkey login path checks `lockedUntil` (was previously bypassed)

### Challenge / State Stores
- **Redis-backed** (when `REDIS_URL` is set) with in-memory fallback (dev)
- Namespaced per use case: `sso-state`, `mfa-pending`, `passkey-register`, `passkey-login`
- In-memory fallback: 10 000-entry LRU cap + 60s GC sweep (prevents unbounded growth)

---

## Authorization

### RBAC (Role-Based Access Control)
- 6 system roles with predefined permissions
- Custom roles with granular `domain:action` permissions
- Wildcard support: `document:*`, `*`
- **System role permissions are immutable** — `PATCH /api/admin/roles/:id` rejects `permissions` changes on system roles (prevents privilege escalation via `end_user` role modification)

### ABAC (Attribute-Based Access Control)
- Allow/deny policies with priority ordering
- Conditions: classification, tags, time-of-day, IP range, device trust
- Deny wins at same priority

### Enforcement
- Server-side on every API route (`createApiHandler`)
- UI hiding is NEVER the only control
- Every authorization decision is audit-logged (allow AND deny)
- **IDOR protection**: all document/folder/share/comment/AI routes verify ownership or share access before operating
- **Platform-admin gating**: billing changes, tenant creation, and refunds require `ADMIN_PLATFORM_*` permissions (not just `ADMIN_TENANT_MANAGE`)

---

## Encryption

### At Rest
| Layer | Method | Scope |
|-------|--------|-------|
| Database | PostgreSQL TDE / disk encryption | Entire DB |
| Object storage | S3 SSE-S3 or SSE-KMS | Bucket-level |
| **Document content** | **AES-256-GCM (per-document DEK)** | **Per file** |
| MFA secrets | AES-256-GCM (tenant KEK) | Per field |
| MFA backup codes | SHA-256 hash (one-way) + AES-256-GCM | Per field |
| SSO client secrets | AES-256-GCM (tenant KEK) | Per field |
| Passwords | Argon2id | Per user |
| Password reset tokens | SHA-256 hash (one-way) | Per token |
| Invitation tokens | SHA-256 hash (one-way) | Per token |
| Step-up tokens | SHA-256 hash (one-way) | Per token |
| API keys | SHA-256 hash (one-way) | Per key |

### Envelope Encryption
- Each document has its own Data Encryption Key (DEK)
- DEK is wrapped (encrypted) by the tenant Key Encryption Key (KEK)
- KEK comes from `SMART_EDMS_KEK` env var (32 bytes hex)
- **Crypto-shredding**: delete the DEK → content is permanently unrecoverable
- **TUS uploads**: now create a real DEK + encrypt ciphertext (previously stored plaintext — M-DOC-9 fix)
- **Document copy**: creates a new DEK + re-encrypts (previously stored source ciphertext without a DEK — L-DOC-2 fix)
- **Version restore**: re-encrypts with a fresh IV (previously reused source IV — L-DOC-3 fix)
- **Redaction**: decrypts with content IV from `version.metadata._encIv` (previously used wrong IV — M-DOC-18 fix)

### In Transit
- TLS 1.2 minimum, TLS 1.3 preferred
- HSTS: `max-age=63072000; includeSubDomains; preload`
- Internal service-to-service: HTTPS (or localhost in single-host deployment)
- **Webhook delivery**: HTTPS-only in production (HTTP URLs rejected)
- **WebSocket internal API**: HTTPS-only in production (or loopback)

---

## Audit & Tamper-Evidence

### Hash-Chained Audit Log
- Every sensitive action creates an `AuditEvent`
- Events are linked: `eventHash = SHA-256(canonical(event) || prevHash)`
- Per-tenant monotonic sequence numbers
- Verification: walk the chain, recompute hashes, detect any break
- **Receipt signatures**: HMAC-SHA256 (not plain SHA-256 concat — prevents length-extension)

### Audit Events Cover
- Authentication (login, logout, failed login, MFA, new device, password change)
- Authorization (allow, deny, step-up)
- Document operations (create, read, update, delete, download, preview, copy, restore, redact)
- Classification changes (especially downgrades)
- Workflow actions (create, approve, reject, delegate)
- Admin actions (user create/suspend, policy change, role assign, role update, webhook update, SSO provider update)
- AI suggestions (request, result, apply)
- Share creation, access, revocation
- Payment operations (invoice created, status transitions, subscription activated, refund)
- Billing anomalies (self-upgrade blocked, suspicious plan transition, price mismatch)
- Cron execution (task success/failure per task)
- CSP violations (via `/api/csp-report`)

### Signed Receipts
- Daily HMAC-SHA256-signed snapshots of the audit chain tip
- Provides a checkpoint for compliance evidence

---

## File Security

### Upload Validation
1. **Magic byte detection** — verify actual file type (not just declared MIME)
2. **MIME spoofing rejection** — declared ≠ detected → reject
3. **File type allowlist** — no HTML/XML/SVG (prevents stored XSS via inline rendering)
4. **Size limit** — 100 MB max (formData), 2 GB max (TUS resumable)
5. **Malware scanning** — heuristic (EICAR, embedded executables, suspicious patterns) + ClamAV integration
6. **Checksum** — SHA-256 + SHA-1 recorded per version
7. **Client checksum verification** — optional `clientChecksumSha256` verified constant-time against server-computed hash (detects truncation)
8. **Envelope encryption** — encrypted with per-document DEK before storage (including TUS path)
9. **Filename sanitization** — strips Unicode bidi overrides (U+202E RTLO), control chars, path traversal, applied to storage key + DB + audit log
10. **Quarantine path sanitization** — malware quarantine path also sanitized (prevents path traversal via malicious filename)
11. **Version cap** — max 50 versions per document; duplicate (same SHA-256) versions rejected

### Download Security
- HMAC-signed URLs (60s expiry), **bound to user session** (`u=` param — prevents URL reuse by different user)
- Permission check before URL generation
- HS/Restricted classifications require elevated permissions
- All downloads audit-logged
- **S3 backend**: presigned URL wrapped in HMAC envelope, proxied through `/api/storage/resolve` (S3 URL never exposed to client)
- **Content-Disposition: attachment** always set on S3 presigned URLs (prevents inline XSS)

### Redaction
- Creates new derivative version (original preserved immutably)
- Decrypts source before redacting (uses content IV from `version.metadata._encIv`)
- ABORT on redaction error — never falls back to original buffer
- Checksum comparison: rejects no-op redactions (identical output)
- PDF: `pdf-lib` draws black rectangles
- Images: `sharp` composites black SVG rectangles
- Redaction regions recorded for audit
- Redaction preview also decrypts (was previously broken — operated on ciphertext)

---

## Web Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | strict (script-src 'self' 'unsafe-inline') + `report-uri /api/csp-report` | Prevent XSS + violation reporting |
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| Referrer-Policy | strict-origin-when-cross-origin | Limit referrer leakage |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | Force HTTPS |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Disable device access |
| Cross-Origin-Opener-Policy | same-origin | Spectre defense (browsing context isolation) |
| Cross-Origin-Resource-Policy | same-origin | Prevent cross-origin resource loading |
| X-Robots-Tag | noindex, nofollow (on /api/* and /shared/*) | Prevent search indexing |
| Cache-Control | no-store (on /login, /reset-password, /accept-invite, /shared/*) | Prevent browser cache replay |

### CSP Violation Reporting
- `POST /api/csp-report` — accepts `application/csp-report` and `application/reports+json`
- Rate-limited per IP (30/min) to prevent report-flooding DoS
- Violations logged to structured logger (`csp.violation` event)

---

## Rate Limiting

**Backend**: Redis sorted-set sliding window (when `REDIS_URL` is set) with in-memory fallback (dev). Multi-instance safe — all instances share the same Redis bucket.

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login (per IP+email) | 10 | 60s |
| Login (per email globally) | 20 | 1 hour |
| API (general) | 100 per user | 60s |
| Upload | 30 per user | 60s |
| AI operations | 10-20 per user | 60s |
| Audit export | 5 per user | 60s |
| Audit verify | 2 per user | 60s |
| Break-glass | 3 per user | 1 hour |
| Share password attempts | 10 per token / 30 per IP | 10 min / 1 min |
| SSO init/callback | 10 per IP | 60s |
| Passkey register init/verify | 5 per user | 60s |
| Search | 60 per user | 60s |
| Document list | 60 per user | 60s |
| Comments | 30 per user | 60s |
| Billing checkout | 10 per user | 60s |
| Billing refund | 5 per user | 60s |
| Disposition approve | 10 per user | 60s |
| Recertification decide | 10 per user | 60s |

**Failover**: if Redis fails mid-call, the limiter falls through to in-memory for that call and marks Redis as unavailable for 30s (re-checks after 30s for fail-back).

---

## SSRF Protection

### URL Inspection
- `isAllowedOutboundUrl()` — string-level check (protocol, hostname against blocked list)
- `isSafeOutboundUrl()` — async, resolves DNS and checks resolved IP

### DNS Pinning
- `ssrfSafeFetch()` — resolves hostname ONCE, verifies IP, pins the TCP connection to that IP via undici `Agent` with custom `connect.lookup`
- Defeats DNS rebinding TOCTOU (attacker re-binds DNS between check and connect)
- Agent cached per (protocol, hostname) for 5 min, then re-resolves
- TLS `servername` preserved for HTTPS cert validation
- Used by: webhook delivery (inline + worker), SSO token + userInfo endpoints

### Blocked IP Ranges
- localhost, 127.0.0.1, 0.0.0.0, ::1
- 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
- 169.254.0.0/16 (link-local + cloud metadata)
- fc00::/7 (IPv6 unique local), fe80::/10 (IPv6 link-local)
- metadata.google.internal

---

## Payment Security

### Zero Client Trust
- Client sends `{ plan, billingCycle, payCurrency, idempotencyKey }` — never a price
- Server reads price from `PLAN_PRICES_USD` table and writes `amountUsd` to the invoice

### Idempotency
- `idempotencyKey` has a DB UNIQUE constraint — duplicate requests return the existing invoice
- Race-safe: P2002 (unique violation) caught and re-queried

### Webhook Verification
- **NowPayments**: HMAC-SHA256 over sorted+concatenated JSON values (`x-nowpayments-sig` header)
- **Stripe**: HMAC-SHA256 over raw body (`Stripe-Signature` header) with 5-min replay window
- Both use constant-time comparison (`crypto.timingSafeEqual`)

### Webhook-Only Business Logic
- Subscription activation runs ONLY in webhook handlers
- `/api/billing/return` is DISPLAY ONLY — reads status, never mutates

### Replay Protection
- `processedWebhooks` JSON array on `PaymentInvoice` — dedup by event ID
- Duplicate deliveries are no-ops

### Atomic Status Transitions
- `updateMany WHERE status = fromStatus` — concurrent webhooks cannot double-transition
- Status machine (`ALLOWED_STATUS_TRANSITIONS`) rejects invalid transitions

### Underpayment Protection
- Invoice only transitions to `confirmed` when `actually_paid >= pay_amount`
- Partial payments stay in `confirming`

### Refund Safety
- Platform-admin permission + step-up auth required
- Never automatic; subscription downgraded to `past_due` (not canceled)

### Billing Policy
- `tenant_admin` can view billing but NOT modify (requires `ADMIN_PLATFORM_BILLING_MANAGE`)
- Plan-transition allowlist: multi-tier upgrades flagged as suspicious
- Per-plan seats + storage caps enforced server-side

---

## Anomaly Detection

Auto-detected on anomalies page load:
- **Burst failed logins**: ≥10 from same IP in 1h
- **Mass download**: ≥50 downloads/previews by single user in 1h
- **Mass export**: ≥10 audit exports by single user in 24h

Alerts:
- User notified on 3rd failed login (in-app + email)
- Admins notified on 5th failed login / account lock (in-app + email)
- Break-glass access notifies all other admins (in-app + email)
- New device login → user notified (in-app + email)
- Password change → user notified (in-app + email)
- Billing self-upgrade attempt → all tenant_admins notified (in-app, severity critical)
- Cron task failure → all tenant_admins notified (in-app, severity critical)

---

## Secrets Management

| Secret | Storage | Rotation |
|--------|---------|----------|
| `NEXTAUTH_SECRET` | Environment variable (≥32 chars) | Rotate → all sessions invalidated |
| `SMART_EDMS_KEK` | Environment variable / KMS (32 bytes) | Rotate → re-wrap all DEKs (`rotateWrappedDeks()`) |
| `CRON_SECRET` | Environment variable (≥32 chars) | Rotate → update cron scheduler config |
| `METRICS_TOKEN` | Environment variable (≥32 chars) | Rotate → update Prometheus scraper config |
| `WS_INTERNAL_SECRET` | Environment variable (≥32 chars) | Rotate → update WS service config |
| `STRIPE_SECRET_KEY` | Environment variable | Rotate → Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | Environment variable | Rotate → Stripe dashboard + update endpoint |
| `NOWPAYMENTS_API_KEY` | Environment variable | Rotate → NowPayments dashboard |
| `NOWPAYMENTS_IPN_SECRET` | Environment variable | Rotate → NowPayments dashboard + update endpoint |
| Database URL | Environment variable | Rotate DB password |
| S3 credentials | Environment variable | Rotate IAM keys |
| SMTP password | Environment variable | Rotate SMTP credentials |

**Rules:**
- No secrets in source code (verified by CI secret scanning)
- No secrets in client bundles (all crypto is server-side)
- No secrets in logs (PII masked, passwords never logged)
- `productionBrowserSourceMaps: false` (defensively pinned)

---

## CORS

- Default: same-origin only (no `Access-Control-Allow-Origin` header sent)
- When `CORS_ALLOW_ORIGIN` is set: dynamic ACAO (only when request `Origin` matches the allowlist)
- Global `OPTIONS` handler via `src/middleware.ts` — returns 204 with CORS headers
- TUS + CSP report routes have their own OPTIONS handlers (protocol-specific)

---

## Compliance Alignment

Smart EDMS is **designed to support** (not certified to) the following:

| Framework | Controls Implemented |
|-----------|---------------------|
| ISO 27001 | Access control, cryptography, audit logging, incident management |
| SOC 2 | Security, availability, confidentiality — audit trail, encryption, MFA |
| GDPR | Data minimization, right to erasure (soft-delete), audit trail |
| HIPAA | Encryption at rest/in transit, access controls, audit logging |
| PCI DSS | Payment security: zero client trust, idempotency, webhook verification, no card data stored |

**Note**: Achieving formal certification requires deployment-specific configuration, infrastructure hardening, and external audit. Smart EDMS provides the technical controls — operational controls (policies, procedures, training) are the deployer's responsibility.
