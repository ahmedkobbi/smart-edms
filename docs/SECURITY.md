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

---

## Authentication

### Password Authentication
- **Hashing**: Argon2id (memoryCost: 19 MiB, timeCost: 2, parallelism: 1) — OWASP-recommended
- **Password policy**: min 12 chars, must include upper/lower/digit/special
- **Lockout**: 5 failed attempts → 15-min lockout
- **Rate limiting**: 10 login attempts per IP+email per 60s

### Multi-Factor Authentication (MFA)
- **TOTP** (RFC 6238) — 30s period, 6 digits
- **Secret storage**: AES-256-GCM encrypted with tenant KEK
- **Backup codes**: 10 single-use codes, encrypted at rest
- **Required for**: tenant_admin role (recommended for all)

### Session Management
- **JWT strategy** (stateless, 8h expiry)
- **Cookie**: `httpOnly`, `sameSite=lax`, `secure` in production
- **Step-up auth**: 5-min token for privileged actions (verify TOTP or password)

### SSO
- **OIDC** and **SAML** provider configuration
- Client secrets AES-256-GCM encrypted
- Attribute mapping (email, name) configurable per provider

---

## Authorization

### RBAC (Role-Based Access Control)
- 6 system roles with predefined permissions
- Custom roles with granular `domain:action` permissions
- Wildcard support: `document:*`, `*`

### ABAC (Attribute-Based Access Control)
- Allow/deny policies with priority ordering
- Conditions: classification, tags, time-of-day, IP range, device trust
- Deny wins at same priority

### Enforcement
- Server-side on every API route (`createApiHandler`)
- UI hiding is NEVER the only control
- Every authorization decision is audit-logged (allow AND deny)

---

## Encryption

### At Rest
| Layer | Method | Scope |
|-------|--------|-------|
| Database | PostgreSQL TDE / disk encryption | Entire DB |
| Object storage | S3 SSE-S3 or SSE-KMS | Bucket-level |
| **Document content** | **AES-256-GCM (per-document DEK)** | **Per file** |
| MFA secrets | AES-256-GCM (tenant KEK) | Per field |
| SSO client secrets | AES-256-GCM (tenant KEK) | Per field |
| Passwords | Argon2id | Per user |

### Envelope Encryption
- Each document has its own Data Encryption Key (DEK)
- DEK is wrapped (encrypted) by the tenant Key Encryption Key (KEK)
- KEK comes from `SMART_EDMS_KEK` env var (32 bytes hex)
- **Crypto-shredding**: delete the DEK → content is permanently unrecoverable

### In Transit
- TLS 1.2 minimum, TLS 1.3 preferred
- HSTS: `max-age=63072000; includeSubDomains; preload`
- Internal service-to-service: HTTPS (or localhost in single-host deployment)

---

## Audit & Tamper-Evidence

### Hash-Chained Audit Log
- Every sensitive action creates an `AuditEvent`
- Events are linked: `eventHash = SHA-256(canonical(event) || prevHash)`
- Per-tenant monotonic sequence numbers
- Verification: walk the chain, recompute hashes, detect any break

### Audit Events Cover
- Authentication (login, logout, failed login, MFA)
- Authorization (allow, deny, step-up)
- Document operations (create, read, update, delete, download, preview)
- Classification changes (especially downgrades)
- Workflow actions (create, approve, reject, delegate)
- Admin actions (user create/suspend, policy change, role assign)
- AI suggestions (request, result, apply)
- Share creation, access, revocation

### Signed Receipts
- Daily HMAC-signed snapshots of the audit chain tip
- Provides a checkpoint for compliance evidence

---

## File Security

### Upload Validation
1. **Magic byte detection** — verify actual file type (not just declared MIME)
2. **MIME spoofing rejection** — declared ≠ detected → reject
3. **File type allowlist** — only approved types accepted
4. **Size limit** — 100 MB max
5. **Malware scanning** — heuristic (EICAR, embedded executables, suspicious patterns) + ClamAV integration
6. **Checksum** — SHA-256 + SHA-1 recorded per version
7. **Envelope encryption** — encrypted with per-document DEK before storage

### Download Security
- HMAC-signed URLs (60s expiry)
- Permission check before URL generation
- HS/Restricted classifications require elevated permissions
- All downloads audit-logged

### Redaction
- Creates new derivative version (original preserved immutably)
- PDF: `pdf-lib` draws black rectangles
- Images: `sharp` composites black SVG rectangles
- Redaction regions recorded for audit

---

## Web Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | strict (script-src 'self') | Prevent XSS |
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| Referrer-Policy | strict-origin-when-cross-origin | Limit referrer leakage |
| Strict-Transport-Security | max-age=63072000; preload | Force HTTPS |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Disable device access |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login | 10 per IP+email | 60s |
| API (general) | 100 per user | 60s |
| Upload | 30 per user | 60s |
| AI operations | 10-20 per user | 60s |
| Audit export | 5 per user | 60s |
| Break-glass | 3 per user | 1 hour |

**Note**: In-memory limiter works for single-instance. For multi-instance, replace with Redis.

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

---

## Secrets Management

| Secret | Storage | Rotation |
|--------|---------|----------|
| `NEXTAUTH_SECRET` | Environment variable | Rotate → all sessions invalidated |
| `SMART_EDMS_KEK` | Environment variable / KMS | Rotate → re-wrap all DEKs (`rotateWrappedDeks()`) |
| `CRON_SECRET` | Environment variable | Rotate → update cron scheduler config |
| Database URL | Environment variable | Rotate DB password |
| S3 credentials | Environment variable | Rotate IAM keys |
| SMTP password | Environment variable | Rotate SMTP credentials |

**Rules:**
- No secrets in source code (verified by CI secret scanning)
- No secrets in client bundles (all crypto is server-side)
- No secrets in logs (PII masked, passwords never logged)

---

## Compliance Alignment

Smart EDMS is **designed to support** (not certified to) the following:

| Framework | Controls Implemented |
|-----------|---------------------|
| ISO 27001 | Access control, cryptography, audit logging, incident management |
| SOC 2 | Security, availability, confidentiality — audit trail, encryption, MFA |
| GDPR | Data minimization, right to erasure (soft-delete), audit trail |
| HIPAA | Encryption at rest/in transit, access controls, audit logging |

**Note**: Achieving formal certification requires deployment-specific configuration, infrastructure hardening, and external audit. Smart EDMS provides the technical controls — operational controls (policies, procedures, training) are the deployer's responsibility.
