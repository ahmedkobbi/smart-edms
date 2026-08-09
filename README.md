# Smart EDMS — Secure Document Governance Platform

A production-grade, multi-tenant SaaS Electronic Document Management System built with Next.js 16, TypeScript, and Prisma. Smart EDMS provides tamper-evident audit trails, classification-driven access control, retention/legal-hold governance, and AI-assisted document intelligence with mandatory human oversight.

> **Compliance posture statement**: Smart EDMS is *designed to support* controls aligned with ISO 27001, SOC 2, GDPR, and HIPAA. It does **not** claim any certification or accreditation. Achieving formal compliance requires deployment-specific configuration, infrastructure hardening, and external audit.

## Documentation

| Document | Description |
|----------|-------------|
| [Deployment Guide](./docs/DEPLOYMENT.md) | Docker, PostgreSQL, S3, SMTP, WebSocket setup |
| [API Documentation (Swagger)](./api-docs) | Interactive OpenAPI 3.1 spec for all ~95 endpoints |
| [OpenAPI Spec](./docs/openapi.json) | Raw OpenAPI 3.1 JSON |
| [API Auth Guide](./docs/API-AUTH.md) | Authentication methods, authorization model, rate limits |
| [Security Architecture](./docs/SECURITY.md) | Threat model, encryption, audit, anomaly detection |
| [PostgreSQL Migration](./docs/POSTGRESQL-MIGRATION.md) | SQLite → PostgreSQL with Row-Level Security |
| [Architecture Decision Records](./docs/adr/README.md) | 12 ADRs covering key design decisions |
| [Backup & Restore](./scripts/backup.sh) | Database + storage backup scripts |
| [Cross-Tenant Isolation Tests](./scripts/test-isolation.ts) | 5-test suite verifying tenant isolation |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser (SPA)                          │
│   App Shell · Sidebar · TopBar · Command Palette · Pages    │
└──────────────────────────────────┬──────────────────────────┘
                                   │ HTTPS (same-origin, CSP-protected)
┌──────────────────────────────────▼──────────────────────────┐
│                  Next.js 16 App Router                       │
│  (app/) pages  ←→  (api/) REST routes                        │
│                                                              │
│  Middleware layer:                                           │
│   • createApiHandler — auth + RBAC + rate-limit + audit     │
│   • Tenant scoping — every query binds tenantId             │
│   • Audit service — hash-chained (SHA-256) tamper-evidence  │
└──────────────────────────────────┬──────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
┌───────▼────────┐         ┌───────▼────────┐        ┌────────▼───────┐
│   Prisma ORM   │         │ File Storage   │        │  AI Service    │
│   (SQLite/PG)  │         │  (Local / S3)  │        │ (heuristic/LLM)│
└────────────────┘         └────────────────┘        └────────────────┘
```

### Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Database | Prisma 6 ORM (SQLite for dev, PostgreSQL-ready) |
| Auth | NextAuth.js v4 (JWT sessions, Credentials provider) |
| Password hashing | Argon2id (memory-hard) |
| MFA | TOTP (RFC 6238) + backup codes (AES-256-GCM encrypted) |
| Object storage | Pluggable: Local FS (dev) / S3-compatible (prod) |
| Rate limiting | In-memory sliding window (Redis-replaceable) |
| Audit integrity | SHA-256 hash-chained append-only log |
| State (client) | TanStack Query + Zustand |
| Forms | react-hook-form + Zod |

---

## Key features

### 1. Multi-tenant isolation
- Every tenant-owned record carries `tenantId`
- All API queries are scoped to the caller's tenant
- Cross-tenant access is denied and audit-logged
- Designed to layer PostgreSQL Row-Level Security in production

### 2. Identity & access
- Argon2id password hashing
- TOTP MFA (Google Authenticator, 1Password, Authy)
- Encrypted MFA secrets + backup codes (AES-256-GCM, KEK from env/KMS)
- Account lockout after 5 failed attempts (15-min cooldown)
- Session expiration (8h) with periodic permission refresh
- Rate-limited login endpoint

### 3. Authorization (RBAC + ABAC)
- Six system roles: `tenant_admin`, `records_manager`, `security_officer`, `compliance_auditor`, `end_user`, `viewer`
- Custom roles with granular permission lists (`domain:action` wildcards supported)
- ABAC policies (allow/deny) with priority ordering and contextual conditions
- Server-side enforcement on every API route — UI hiding is never the only control
- Every authorization decision is audit-logged (allow AND deny)

### 4. Document lifecycle
- Upload with magic-byte MIME validation (defense vs. spoofing)
- SHA-256 + SHA-1 checksums per version
- Immutable version history
- Lock/unlock with reason + audit
- Soft-delete (preserves audit chain)
- Record declaration (formal records cannot be deleted)
- Configurable retention schedules (delete/archive/review)
- Legal hold (overrides retention; blocks deletion & downgrades)

### 5. Classification & sensitivity labels
- Five default levels: Public, Internal, Confidential, Restricted, Highly Sensitive
- Visual banners in UI (color-coded by level)
- Downgrades require elevated permission + justification
- Downgrades blocked under legal hold
- All changes audit-logged with full history

### 6. Tamper-evident audit log
- Append-only at application layer
- Per-tenant monotonic sequence numbers
- SHA-256 hash chain: `eventHash = SHA-256(canonical_event || prevHash)`
- One-click integrity verification walks the entire chain
- CSV export (rate-limited, audit-logged)
- Audit events cover: auth, authz, document CRUD, downloads, shares, classifications, admin actions, AI suggestions

### 7. Workflow & approvals
- Multi-step sequential/parallel approvals
- Delegation + escalation hooks
- Approval signatures (SHA-256 attestation)
- Step completion logic (any/all approvers)
- Auto-record declaration on approval

### 8. Secure sharing
- Time-limited signed URLs (HMAC-SHA256)
- Optional password protection (Argon2id)
- View-count limits
- Dynamic watermarking (recipient + timestamp + token)
- Revocation + audit trail
- Blocked by policy for Restricted/Highly Sensitive classifications

### 9. AI-assisted intelligence (human-in-the-loop)
- Classification suggestions (heuristic + LLM fallback)
- PII/keyword detection
- **AI never silently performs**: classification downgrade, deletion, legal-hold removal, access grant expansion, or export of restricted content
- All AI actions audit-logged with source attribution
- Tenant-level opt-out supported via feature flags

### 10. Admin console
- User management (create, suspend, role assignment, MFA reset)
- Role management (custom roles + permission picker)
- Policy management (ABAC rule editor)
- Classification taxonomy editor
- Retention schedule editor
- Legal hold management (create, release with audit)
- Audit viewer with hash-chain verification

### 11. Security posture
- TLS-ready (configure reverse proxy / hosted env)
- Strict CSP, X-Frame-Options: DENY, HSTS, Referrer-Policy
- `httpOnly`, `sameSite=lax`, secure cookies in production
- No secrets in client bundles — all sensitive operations are server-side
- Path-traversal protection in storage layer
- File type allowlist + magic-byte validation
- Signed URL expiry (60s default)
- CSRF protection via NextAuth

---

## Getting started

### Prerequisites
- Node.js 20+ or Bun
- SQLite (dev) or PostgreSQL (prod)

### Installation

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env — set NEXTAUTH_SECRET, NEXTAUTH_URL, etc.

# 3. Push database schema
bun run db:push

# 4. Seed default tenant, admin user, roles, classifications
bun run scripts/seed.ts

# 5. Start dev server
bun run dev
```

### Default admin credentials (CHANGE IMMEDIATELY)

```
URL:      http://localhost:3000
Email:    admin@smartedms.local
Password: ChangeMe!2025
```

### Production deployment

1. **Database**: Switch `DATABASE_URL` to PostgreSQL; add RLS policies.
2. **Storage**: Set `STORAGE_DRIVER=s3` and configure S3/MinIO/R2 credentials.
3. **Secrets**: Set `NEXTAUTH_SECRET`, `SMART_EDMS_KEK` (32-byte hex/base64) via secret manager.
4. **TLS**: Terminate TLS at load balancer; HSTS is auto-enabled.
5. **Backups**: Enable point-in-time DB recovery + object storage versioning.
6. **Monitoring**: Forward logs to your SIEM; alert on `result=deny` spikes and `audit.verify` failures.

---

## Project structure

```
src/
├── app/
│   ├── (app)/                 # Authenticated route group (AppShell)
│   │   ├── dashboard/
│   │   ├── documents/
│   │   │   ├── [id]/          # Detail w/ tabs: overview, versions, audit, share, AI
│   │   ├── search/
│   │   ├── workflows/
│   │   ├── audit/             # Tamper-evident log viewer + verify
│   │   ├── admin/
│   │   │   ├── users/
│   │   │   ├── roles/
│   │   │   ├── classifications/
│   │   │   ├── policies/
│   │   │   ├── retention/
│   │   │   └── legal-holds/
│   │   └── settings/
│   ├── shared/[token]/        # Public share viewer (watermarked)
│   ├── login/
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   ├── documents/[id]/
│   │   ├── admin/...
│   │   ├── audit/
│   │   └── ...
│   ├── layout.tsx
│   └── page.tsx               # Redirects to /dashboard or /login
├── components/
│   ├── layout/                # Sidebar, TopBar, AppShell, CommandPalette
│   ├── providers/             # Theme, Session, Query
│   └── ui/                    # shadcn/ui components
├── lib/
│   ├── auth/                  # auth-options, permissions, crypto, totp
│   ├── audit/                 # Hash-chained audit service
│   ├── api/                   # createApiHandler, client
│   ├── storage/               # Local + S3 adapters, file validation
│   ├── ai/                    # Heuristic + LLM classifier
│   ├── security/              # Rate limiter
│   └── utils/
└── prisma/
    └── schema.prisma          # Full multi-tenant schema

scripts/
└── seed.ts                    # Bootstrap tenant, admin, roles, classifications
```

---

## API surface

All `/api/*` routes are wrapped by `createApiHandler` which provides:
- Authentication (NextAuth session)
- Tenant scoping (auto-bound `tenantId`)
- RBAC permission check
- Per-route rate limiting
- Automatic audit logging (allow + deny + error)
- Standardized error envelope: `{ error: { code, message, ... } }`

### Key endpoints

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| POST | `/api/documents` | `document:create` | Upload new document (multipart) |
| GET | `/api/documents` | `search:use` | List documents |
| GET | `/api/documents/:id` | `document:read` | Document detail |
| PATCH | `/api/documents/:id` | `document:update` | Update metadata/classification |
| DELETE | `/api/documents/:id` | `document:delete` | Soft-delete (respects legal hold) |
| POST | `/api/documents/:id/versions` | `document:update` | Upload new version |
| GET | `/api/documents/:id/download` | `document:download` | Get signed download URL |
| POST | `/api/documents/:id/lock` | `document:lock` | Lock document |
| POST | `/api/documents/:id/ai-suggest` | `ai:suggestion.request` | AI classification suggestion |
| POST | `/api/documents/:id/share` | `share:create` | Create share link |
| GET | `/api/search` | `search:use` | Permission-aware search |
| GET | `/api/audit` | `audit:read` | Audit log query |
| GET | `/api/audit/verify` | `audit:verify` | Verify hash chain |
| GET | `/api/audit/export` | `audit:export` | CSV export |
| GET | `/api/admin/users` | `admin:users.manage` | User list |
| POST | `/api/admin/users` | `admin:users.manage` | Create user |
| GET | `/api/admin/classifications` | `admin:classifications.manage` | Taxonomy |
| GET | `/api/admin/policies` | `admin:policies.manage` | ABAC policies |
| GET | `/api/admin/legal-holds` | `legal-hold:manage` | Legal holds |
| GET | `/api/dashboard` | (any) | Aggregated stats |
| GET | `/api/me` | (any) | Current user info |
| POST | `/api/me/password` | (any) | Change password |
| POST | `/api/me/mfa?action=setup\|enable\|disable` | (any) | MFA management |

---

## Security notes for operators

1. **Rotate the seed admin password** immediately after first login.
2. **Set `SMART_EDMS_KEK`** to a 32-byte value from your KMS / `openssl rand -hex 32`. The auto-generated on-disk key is **dev only**.
3. **Enable MFA** on all admin accounts (TOTP mandatory for tenant_admin in production).
4. **Configure backup retention** — audit logs are append-only and must be retained per your compliance schedule.
5. **Monitor `audit.verify` failures** — they indicate potential tampering.
6. **Restrict outbound network** for the app server except to required services (DB, S3, IdP).
7. **Do not log request bodies** in production proxies — they may contain document content.

---

## What this is NOT

- Not a qualified e-signature provider (basic audit-trail signatures only)
- Not certified/accredited to any standard (controls are *aligned with*, not *certified to*)
- Not designed to handle government-classified material in non-accredited environments
- Not a substitute for an organizational incident-response process
- Not immutable at the database layer — application-layer immutability must be reinforced with DB grants in production

---

## License

Proprietary — All rights reserved. This source is provided for evaluation and authorized deployment only.
