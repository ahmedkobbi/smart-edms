<div align="center">

# Smart EDMS

### Enterprise-Grade SaaS Document Governance Platform

*An Algerian-built, internationally-standards-aligned SaaS Electronic Document Management System — engineered for security teams, compliance officers, and records managers who need tamper-evident auditability, classification-driven access control, and AI-assisted intelligence with mandatory human oversight.*

[![Made in Algeria](https://img.shields.io/badge/Made%20in-Algeria-006233?style=flat-square&labelColor=006233&color=d21034)](#roots--standards)
[![Version](https://img.shields.io/badge/version-1.0.0-18181b?style=flat-square&labelColor=0f172a&color=6366f1)](.)
[![Next.js](https://img.shields.io/badge/Next.js-16-18181b?style=flat-square&logo=next.js&logoColor=white&labelColor=000000&color=111827)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white&labelColor=3178c6)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?style=flat-square&logo=prisma&logoColor=white&labelColor=2d3748)](https://www.prisma.io)
[![License](https://img.shields.io/badge/license-Proprietary-18181b?style=flat-square&labelColor=0f172a&color=dc2626)](#license)
[![Tests](https://img.shields.io/badge/tests-400%2B%20passing-18181b?style=flat-square&labelColor=0f172a&color=16a34a)](#testing)
[![Security](https://img.shields.io/badge/security-125%2B%20findings%20patched-18181b?style=flat-square&labelColor=0f172a&color=0891b2)](#security-posture)
[![PWA](https://img.shields.io/badge/PWA-installable-18181b?style=flat-square&labelColor=0f172a&color=7c3aed)](#progressive-web-app)
[![i18n](https://img.shields.io/badge/i18n-5%20locales-18181b?style=flat-square&labelColor=0f172a&color=db2777)](#internationalization)

**🌐 Read this README in:** [English](./README.md) · [العربية](./README.ar.md)

</div>

---

## Overview

Smart EDMS is a full-stack SaaS platform for governing the complete lifecycle of business documents across multiple tenants. It combines a hardened security architecture (zero-trust, defense-in-depth, hash-chained audit trails) with a modern, glassmorphic, mobile-first user experience. The system is designed to support controls aligned with **ISO 27001**, **SOC 2**, **GDPR**, and **HIPAA** — and ships with a SaaS operations tier (tenant lifecycle, self-service signup, dual payment providers, platform admin console).

> **Compliance posture statement.** Smart EDMS is *designed to support* controls aligned with **ISO 27001**, **SOC 2**, **GDPR**, **HIPAA**, and Algeria's **Law No. 18-07** of 10 June 2018 on the protection of natural persons in the processing of personal data (under the oversight of the ARPDD — *Autorité de Régulation de la Protection des Données à caractère Personnel*). It does **not** claim any certification or accreditation. Achieving formal compliance requires deployment-specific configuration, infrastructure hardening, and external audit.

### Why Smart EDMS

| | |
|---|---|
| **Tamper-evident by design** | Every sensitive action is written to an append-only, SHA-256 hash-chained audit log. One-click integrity verification walks the entire chain and flags any tampering. |
| **Zero client trust** | Security-critical fields (prices, permissions, filenames, classification downgrades) are never accepted from the client — the server re-derives them from its own state. |
| **AI with a human gate** | AI can suggest, but never silently act. Classification downgrades, deletions, legal-hold removals, and access expansions all require a human approver. |
| **Multi-tenant from day one** | Tenant scoping is enforced at the query layer, the API layer, and the audit layer — not bolted on. Production deployments can layer PostgreSQL Row-Level Security on top. |
| **Real SaaS economics** | Customer self-registration, dual payment providers (Stripe + NowPayments crypto), invoicing, subscriptions, and a platform-admin console with cross-tenant visibility. |
| **Premium developer experience** | Strict TypeScript, 400+ unit tests, 14 e2e tests, OpenAPI 3.1 spec, 16 ADRs, operations runbook, hardened CI, and one-command local bootstrap. |

---

## Roots & Standards

<div align="center">

**صُنع في الجزائر — يخدم العالم**

*Made in Algeria — built for the world.*

</div>

Smart EDMS is an **Algerian project**, conceived and engineered to meet international standards. It carries forward a tradition of meticulous craftsmanship — the same attention to detail that for centuries has shaped the medinas of Algiers, Constantine, and Tlemcen — and applies it to modern software engineering. The result is a platform that does not choose between local identity and global ambition: it pursues both, deliberately.

The architecture, threat model, and control set were designed in Algeria and benchmarked against the world's most demanding compliance frameworks. Every cryptographic primitive (Argon2id, AES-256-GCM, HMAC-SHA256, TOTP per RFC 6238), every audit-log entry (SHA-256 hash-chained, append-only), and every payment-security rule (the 12-rule model under ADR-016) reflects an engineering culture that treats rigor as a craft, not a checklist.

### Standards alignment

The platform is *designed to support* controls aligned with:

| Framework | Scope | Origin |
|-----------|-------|--------|
| **ISO/IEC 27001** | Information security management systems (ISMS) | International (ISO/IEC) |
| **SOC 2** | Trust Services Criteria — Security, Availability, Confidentiality | International (AICPA) |
| **GDPR** | Protection of natural persons regarding processing of personal data | European Union |
| **HIPAA** | Protected health information in healthcare contexts | United States |
| **Law No. 18-07** | Protection of natural persons in the processing of personal data | Algeria (10 June 2018) |
| **ARPDD oversight** | National data-protection authority compliance | Algeria (ARPDD) |

> *Algerian by origin. International by standard. Universal by design.*

---

## Highlights at a Glance

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  334  TypeScript source files          148  REST API endpoints       │
 │   65  Prisma data models               51  Application pages         │
 │   68  React UI components              400+  Unit tests passing       │
 │   14  End-to-end tests                   5  Locales (en/fr/ar/es/de) │
 │ 125+  Security findings patched        16  Architecture Decisions    │
 │   12  Payment-security rules         1,209  i18n keys per locale     │
 └──────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

- [Overview](#overview)
- [Roots & Standards](#roots--standards)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Surface](#api-surface)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security Posture](#security-posture)
- [Internationalization](#internationalization)
- [Progressive Web App](#progressive-web-app)
- [Documentation](#documentation)
- [What This Is NOT](#what-this-is-not)
- [License](#license)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Client (Browser / PWA)                          │
│   App Shell · Glassmorphism UI · Command Palette · Bottom Nav (mobile)  │
│   TanStack Query · Zustand · react-hook-form + Zod · next-intl          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTPS (same-origin, CSP-protected)
┌────────────────────────────────────▼────────────────────────────────────┐
│                      Next.js 16 App Router (Edge/Node)                   │
│                                                                          │
│   Middleware  ──►  createApiHandler                                      │
│     • Auth (NextAuth JWT)          • Authentication                      │
│     • Tenant scoping               • Tenant binding (every query)        │
│     • CSP / security headers       • RBAC + ABAC permission check        │
│     • Rate limit (Redis)           • Per-route rate limiting             │
│                                    • Audit logging (allow + deny)        │
└───┬───────────────┬───────────────┬───────────────┬───────────────┬──────┘
    │               │               │               │               │
┌───▼───────┐ ┌─────▼─────┐ ┌───────▼───────┐ ┌────▼─────┐ ┌───────▼──────┐
│ Prisma 6  │ │ Storage   │ │ Audit Service │ │ AI Svc   │ │ Billing Svc  │
│ SQLite/PG │ │ Local/S3  │ │ SHA-256 chain │ │ Heur +   │ │ Stripe +     │
│ 65 models │ │ TUS upload│ │ Append-only   │ │ LLM      │ │ NowPayments  │
└───────────┘ └───────────┘ └───────────────┘ └──────────┘ └──────────────┘
    │               │               │               │               │
┌───▼───────────────▼───────────────▼───────────────▼───────────────▼──────┐
│                        Infrastructure Layer                              │
│   Redis (rate limit + queues + session store)   BullMQ (background jobs) │
│   OpenSearch (semantic search)   Hocuspocus/Yjs (real-time collab)       │
│   ClamAV (malware scan)   SMTP (email)   Web Push (notifications)        │
└──────────────────────────────────────────────────────────────────────────┘
```

### Request lifecycle

```
Browser → TLS → Middleware (CSP, tenant cookie, security headers)
            → createApiHandler
                 → authenticate (NextAuth JWT)
                 → resolve tenant (cookie / subdomain / platform-admin override)
                 → check rate limit (Redis sliding window)
                 → authorize (RBAC permission + ABAC policy)
                 → execute handler (Prisma query, tenant-scoped)
                 → audit log (allow / deny / error, hash-chained)
            → standardized JSON envelope { data | error: { code, message } }
```

---

## Key Features

### Multi-Tenant SaaS Platform

- **Tenant lifecycle** — create, suspend, activate, delete with full audit trail
- **Public marketing site** at `/` with premium glassmorphism (hero, features, pricing, security highlights)
- **Customer self-registration** at `/signup` — honeypot-protected, rate-limited, email-verified
- **Platform admin tier** — `PLATFORM_ADMIN` role with cross-tenant visibility via `?tenantId=` override
- **Per-tenant configuration** — classifications, retention schedules, policies, AI opt-in/out, SSO providers

### Identity & Access

- **Password auth** — Argon2id (memoryCost 19 MiB, OWASP-recommended), 12-char policy, 5-attempt lockout
- **MFA** — TOTP (RFC 6238) with replay protection, AES-256-GCM encrypted secrets, SHA-256 hashed backup codes
- **Step-up auth** — 5-minute tokens (SHA-256 hashed, race-safe `updateMany`) for privileged actions
- **SSO** — OIDC (PKCE S256) + SAML (`wantAssertionsSigned`, 1-min clock skew), email-domain allowlist for JIT
- **Passkeys / WebAuthn** — `userVerification: 'required'`, AAGUID allowlist, Redis-backed challenge store
- **Sessions** — JWT (8h), `httpOnly` + `sameSite=lax` + `__Secure-` prefix in prod, per-JWT denylist + mass-revoke
- **Account lockout** — enforced on password, SSO, and passkey login paths

### Authorization (RBAC + ABAC)

- **Six system roles** — `tenant_admin`, `records_manager`, `security_officer`, `compliance_auditor`, `end_user`, `viewer`
- **Custom roles** — granular `domain:action` permissions with wildcard support
- **ABAC policies** — allow/deny with priority ordering and contextual conditions
- **Server-side enforcement on every route** — UI hiding is never the only control
- **Every decision audit-logged** — both allow AND deny, with policy evaluation trace

### Document Lifecycle

- **Upload** — magic-byte MIME validation (defense vs. spoofing), TUS resumable uploads, S3 multipart
- **Versioning** — immutable history, SHA-256 + SHA-1 checksums per version
- **Lock/unlock** — with reason + audit
- **Soft-delete** — preserves audit chain
- **Record declaration** — formal records cannot be deleted
- **Retention schedules** — configurable delete / archive / review actions
- **Legal hold** — overrides retention, blocks deletion and classification downgrades
- **Disposition records** — formal record of destruction with full chain of custody

### Classification & Sensitivity

- **Five default levels** — Public, Internal, Confidential, Restricted, Highly Sensitive
- **Visual banners** — color-coded by sensitivity in the UI
- **Downgrade controls** — requires elevated permission + justification, blocked under legal hold
- **Full change history** — every classification change audit-logged with diff
- **Localized taxonomy** — classifications translated per-tenant per-locale

### Tamper-Evident Audit Log

- **Append-only at application layer** — reinforced with DB grants in production
- **Per-tenant monotonic sequence numbers**
- **SHA-256 hash chain** — `eventHash = SHA-256(canonical_event || prevHash)`
- **One-click integrity verification** — walks the entire chain, flags any tampering
- **CSV export** — rate-limited and audit-logged
- **Covers** — auth, authz, document CRUD, downloads, shares, classifications, admin actions, AI suggestions, payments

### Workflow & Approvals

- **Multi-step sequential/parallel approvals** with delegation + escalation hooks
- **Approval signatures** — SHA-256 attestation per approver
- **Step completion logic** — any/all approvers
- **Auto-record declaration** on approval completion
- **Dual control** — sensitive operations require two independent approvers

### Secure Sharing

- **Time-limited signed URLs** — HMAC-SHA256, 60s default expiry
- **Optional password protection** — Argon2id
- **View-count limits** and dynamic watermarking (recipient + timestamp + token)
- **Revocation + full audit trail**
- **Policy-enforced** — blocked for Restricted / Highly Sensitive classifications

### AI-Assisted Intelligence (Human-in-the-Loop)

- **Classification suggestions** — heuristic engine + LLM fallback
- **PII / keyword detection** with confidence scoring
- **AI never silently performs**: classification downgrade, deletion, legal-hold removal, access grant expansion, or export of restricted content
- **All AI actions audit-logged** with source attribution
- **Tenant-level opt-out** via feature flags
- **OCR pipeline** — pdfjs-dist rasterization, confidence tracking, franc language detection

### Collaboration & Search

- **Real-time co-editing** — Hocuspocus + Yjs + TipTap
- **Live presence** — see collaborators' cursors and selections
- **Comments** — anchored to document positions
- **OpenSearch semantic search** — vector embeddings + full-text, permission-aware
- **Saved searches** — per-user reusable queries with alerts

### Billing & Payments

- **Stripe** — card payments, Checkout, subscription management, webhook reconciliation
- **NowPayments** — crypto payments (BTC, ETH, USDT, and 50+ assets)
- **12-rule payment security model** — zero client trust, idempotency, HMAC webhook verification, webhook-only business logic, IP allowlist, replay protection, atomic status transitions, underpayment protection, cron reconciliation, invoice expiry, refund safety, audit trail
- **Invoice lifecycle** — generate, pay, reconcile, expire, refund — all audit-logged
- **Subscription tiers** — per-tenant plan management with quota enforcement

### Admin Console

- **User management** — create, suspend, role assignment, MFA reset
- **Role management** — custom roles + permission picker
- **Policy management** — ABAC rule editor with priority ordering
- **Classification taxonomy editor** with localization
- **Retention schedule editor** and legal-hold management
- **Audit viewer** with hash-chain verification
- **Job queue monitor** (BullMQ) and platform-admin cross-tenant view

### Security & Infrastructure

- **TLS-ready** — terminate at reverse proxy / hosted env; HSTS auto-enabled
- **Strict CSP**, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `X-Content-Type-Options`
- **`httpOnly`, `sameSite=lax`, secure cookies** in production
- **No secrets in client bundles** — all sensitive operations server-side
- **Path-traversal protection** in storage layer
- **File type allowlist + magic-byte validation**
- **SSRF DNS pinning** (undici) for all outbound requests
- **AES-256-GCM envelope encryption** for secrets at rest, crypto-shredding support
- **ClamAV malware scanning** with heuristic fallback
- **CSRF protection** via NextAuth
- **Browser push notifications** (Web Push API)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Turbopack, standalone output) |
| Language | TypeScript 5 (strict mode, `tsc --noEmit` in CI) |
| UI | React 19, Tailwind CSS 4, shadcn/ui (New York), Radix primitives |
| Animation | Framer Motion, GSAP, `tw-animate-css` |
| Database | Prisma 6 ORM (SQLite dev / PostgreSQL prod, 65 models) |
| Auth | NextAuth.js v4 (JWT, Credentials + OIDC + SAML + Passkeys) |
| Password hashing | Argon2id (memory-hard) |
| MFA | TOTP (RFC 6238) + backup codes (AES-256-GCM) |
| Object storage | Pluggable: Local FS (dev) / S3-compatible (prod) + TUS resumable |
| Rate limiting | Redis-backed sliding window |
| Audit integrity | SHA-256 hash-chained append-only log |
| Search | OpenSearch (semantic + full-text) |
| Real-time | Hocuspocus + Yjs + TipTap |
| Queue | BullMQ + Redis (background jobs) |
| Payments | Stripe (card) + NowPayments (crypto) |
| Notifications | Nodemailer (email) + Web Push (browser) |
| State (client) | TanStack Query + Zustand |
| Forms | react-hook-form + Zod |
| i18n | next-intl (5 locales: en, fr, ar, es, de) |
| PWA | manifest, service worker, 5 app icons, offline page |
| Testing | Vitest (unit) + Playwright (e2e) + custom k6-style load |
| Observability | Sentry + structured logging + health endpoint |
| Containerization | Multi-stage Dockerfile (non-root, health check) |
| Orchestration | Kubernetes (6 manifest files) |
| CI/CD | GitHub Actions (lint, type-check, unit, e2e, security audit, Docker build) |

---

## Getting Started

### Prerequisites

- **Node.js 20+** or **Bun** (recommended for speed)
- **SQLite** (dev, zero-config) or **PostgreSQL 15+** (prod)
- **Redis 7+** (required for rate limiting, queues, session stores)

### Installation

```bash
# 1. Clone
git clone https://github.com/ahmedkobbi/smart-edms.git
cd smart-edms

# 2. Install dependencies (Bun recommended)
bun install

# 3. Configure environment
cp .env.example .env
#    → Set NEXTAUTH_SECRET:        openssl rand -base64 32
#    → Set SMART_EDMS_KEK:         openssl rand -hex 32
#    → Set DATABASE_URL (SQLite default works for dev)

# 4. Push database schema
bun run db:push

# 5. Seed default tenant, admin user, roles, classifications
bun run seed

# 6. Start the dev server (logs to dev.log)
bun run dev

# 7. (Optional) Start the background worker in another terminal
bun run worker
```

### Default Admin Credentials

> **Change immediately after first login.**

```
URL:      http://localhost:3000
Email:    admin@smartedms.local
Password: ChangeMe!2025
```

### Useful Scripts

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start Next.js dev server on port 3000 |
| `bun run worker` | Start the BullMQ background worker |
| `bun run build` | Production build (standalone output) |
| `bun run start` | Run the production standalone server |
| `bun run lint` | ESLint across the codebase |
| `bun run test` | Run Vitest unit tests |
| `bun run test:watch` | Vitest in watch mode |
| `bun run test:coverage` | Vitest with V8 coverage |
| `bun run test:e2e` | Playwright end-to-end tests |
| `bun run test:e2e:ui` | Playwright interactive UI mode |
| `bun run db:push` | Push Prisma schema to database |
| `bun run db:migrate` | Create + apply a Prisma migration |
| `bun run db:reset` | Drop + recreate the database |
| `bun run seed` | Seed default tenant, admin, roles, classifications |
| `bun run check:translations` | Verify i18n key completeness across locales |

---

## Project Structure

```
smart-edms/
├── src/
│   ├── app/
│   │   ├── (app)/                 # Authenticated route group (AppShell)
│   │   │   ├── dashboard/         # KPIs, recent activity, charts
│   │   │   ├── documents/         # List + detail (overview/versions/audit/share/AI)
│   │   │   ├── folders/           # Hierarchical folder tree
│   │   │   ├── search/            # Permission-aware semantic search
│   │   │   ├── workflows/         # Approval workflow management
│   │   │   ├── audit/             # Tamper-evident log viewer + verify
│   │   │   ├── admin/             # users / roles / classifications / policies
│   │   │   │                      # retention / legal-holds
│   │   │   └── settings/          # Profile, security, preferences
│   │   ├── api/                   # 148 REST endpoints (see API Surface)
│   │   ├── api-docs/              # Interactive OpenAPI 3.1 Swagger UI
│   │   ├── login/  signup/        # Public auth pages
│   │   ├── shared/[token]/        # Public share viewer (watermarked)
│   │   ├── offline/               # PWA offline fallback
│   │   ├── error.tsx              # 500 page (glassmorphism)
│   │   ├── global-error.tsx       # Root error boundary
│   │   ├── not-found.tsx          # 404 page
│   │   ├── unauthorized.tsx       # 401/403 page
│   │   └── layout.tsx             # Root layout (providers, fonts, metadata)
│   ├── components/                # 68 React components
│   │   ├── layout/                # Sidebar, TopBar, AppShell, CommandPalette
│   │   ├── providers/             # Theme, Session, Query, Intl
│   │   └── ui/                    # shadcn/ui primitives (glassmorphism variants)
│   ├── hooks/                     # Custom React hooks
│   ├── i18n/                      # next-intl configuration
│   ├── lib/                       # Domain logic
│   │   ├── ai/                    # Heuristic + LLM classifier, OCR pipeline
│   │   ├── api/                   # createApiHandler, client, error envelope
│   │   ├── audit/                 # Hash-chained audit service
│   │   ├── auth/                  # auth-options, permissions, crypto, totp
│   │   ├── billing/               # Stripe + NowPayments + payment-service
│   │   ├── config/                # Env validation, feature flags
│   │   ├── documents/             # Document service, versioning, redaction
│   │   ├── i18n/                  # Server-side translator, ICU pluralization
│   │   ├── notifications/         # Email, push, in-app routing
│   │   ├── queue/                 # Redis + BullMQ job definitions
│   │   ├── search/                # OpenSearch + semantic search
│   │   ├── security/              # Rate limiter, anomaly detection
│   │   ├── storage/               # Local + S3 adapters, TUS, file validation
│   │   ├── utils/                 # Shared utilities
│   │   └── workflow/              # Approval engine, delegation, escalation
│   ├── middleware.ts              # CSP, tenant cookie, security headers
│   ├── instrumentation.ts         # Sentry + startup hooks
│   └── worker/                    # BullMQ worker entry point
├── prisma/
│   └── schema.prisma              # 65 models — full multi-tenant schema
├── messages/                      # i18n catalogs (en, fr, ar, es, de)
├── public/                        # PWA icons, manifest, service worker, logo
├── tests/
│   ├── unit/                      # 400+ Vitest unit tests
│   ├── e2e/                       # 14 Playwright e2e tests
│   └── load/                      # k6-style load test + results
├── k8s/                           # 6 Kubernetes manifests + README
├── docs/                          # Deployment, security, ADRs, runbook, OpenAPI
├── scripts/                       # Seed, backup, verify-deployment, i18n tooling
├── .github/workflows/ci.yml       # Hardened CI pipeline
├── Dockerfile                     # Multi-stage, non-root, health check
├── docker-compose.yml             # Full local stack (app + worker + Redis + PG)
├── docker-compose.staging.yml     # Staging overlay
└── .env.example                   # Annotated environment template
```

---

## API Surface

All `/api/*` routes are wrapped by `createApiHandler`, which enforces authentication, tenant scoping, RBAC + ABAC authorization, per-route rate limiting, and automatic audit logging (allow + deny + error). Every response uses a standardized envelope: `{ data }` on success or `{ error: { code, message, ... } }` on failure.

The full interactive spec lives at **`/api-docs`** (Swagger UI) with the raw OpenAPI 3.1 JSON at `docs/openapi.json`.

### Endpoint groups (148 routes total)

| Group | Path prefix | Purpose |
|-------|-------------|---------|
| Auth | `/api/auth/*` | NextAuth credentials, OIDC, SAML, passkeys |
| Documents | `/api/documents/*` | CRUD, versions, lock, share, AI suggest, download |
| Folders | `/api/folders/*` | Hierarchical folder tree |
| Search | `/api/search` | Permission-aware semantic + full-text search |
| Saved Searches | `/api/saved-searches/*` | Per-user reusable queries |
| Workflows | `/api/workflows/*` | Approval definitions, instances, delegations |
| Audit | `/api/audit/*` | Query, verify hash chain, CSV export |
| Admin | `/api/admin/*` | Users, roles, classifications, policies, retention, legal-holds |
| Tenants | `/api/tenants/*` | Tenant lifecycle (platform admin) |
| Billing | `/api/billing/*` | Subscriptions, invoices, Stripe + NowPayments webhooks |
| Shares | `/api/shares/*` | Signed URL creation, revocation |
| Storage | `/api/storage/*` | TUS upload, presigned downloads |
| Sessions | `/api/sessions/*` | Active sessions, revocation |
| Notifications | `/api/notifications/*` | In-app, email, push routing |
| Translations | `/api/translations/*` | Per-tenant locale overrides |
| Push | `/api/push/*` | Web Push subscription management |
| Metrics | `/api/metrics` | Prometheus-format metrics |
| Health | `/api/health` | Liveness + readiness probe |
| Cron | `/api/cron/*` | Scheduled tasks (workflow escalation, reconciliation) |
| CSP Report | `/api/csp-report` | Content Security Policy violation reporting |
| OpenAPI | `/api/openapi` | Raw OpenAPI 3.1 JSON |
| Me | `/api/me/*` | Current user info, password, MFA management |
| Dashboard | `/api/dashboard` | Aggregated KPIs |

### Representative endpoints

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| `POST` | `/api/documents` | `document:create` | Upload new document (multipart / TUS) |
| `GET` | `/api/documents` | `search:use` | List documents (filtered + paginated) |
| `GET` | `/api/documents/:id` | `document:read` | Document detail |
| `PATCH` | `/api/documents/:id` | `document:update` | Update metadata / classification |
| `DELETE` | `/api/documents/:id` | `document:delete` | Soft-delete (respects legal hold) |
| `POST` | `/api/documents/:id/versions` | `document:update` | Upload new version |
| `GET` | `/api/documents/:id/download` | `document:download` | Get signed download URL |
| `POST` | `/api/documents/:id/lock` | `document:lock` | Lock document |
| `POST` | `/api/documents/:id/ai-suggest` | `ai:suggestion.request` | AI classification suggestion |
| `POST` | `/api/documents/:id/share` | `share:create` | Create share link |
| `GET` | `/api/search` | `search:use` | Permission-aware search |
| `GET` | `/api/audit` | `audit:read` | Audit log query |
| `GET` | `/api/audit/verify` | `audit:verify` | Verify hash chain integrity |
| `GET` | `/api/audit/export` | `audit:export` | CSV export (rate-limited) |
| `GET` | `/api/admin/users` | `admin:users.manage` | User list |
| `POST` | `/api/admin/users` | `admin:users.manage` | Create user |
| `GET` | `/api/admin/classifications` | `admin:classifications.manage` | Taxonomy |
| `GET` | `/api/admin/policies` | `admin:policies.manage` | ABAC policies |
| `GET` | `/api/admin/legal-holds` | `legal-hold:manage` | Legal holds |
| `GET` | `/api/dashboard` | (any) | Aggregated stats |
| `GET` | `/api/me` | (any) | Current user info |
| `POST` | `/api/me/password` | (any) | Change password |
| `POST` | `/api/me/mfa?action=setup\|enable\|disable` | (any) | MFA management |

---

## Testing

Smart EDMS ships with a multi-layered test suite that runs in CI on every push and pull request.

### Unit tests — Vitest

```bash
bun run test              # run once
bun run test:watch        # watch mode
bun run test:coverage     # with V8 coverage
```

**400+ tests** covering:

- `audit-hash-chain.test.ts` — SHA-256 chain integrity, tamper detection
- `auth-lifecycle.test.ts` — login, lockout, session rotation, MFA
- `billing-policy.test.ts` — subscription tier enforcement, quota limits
- `email-template.test.ts` — template rendering, locale fallback
- `envelope-encryption.test.ts` — AES-256-GCM encrypt/decrypt, KEK rotation
- `env-validation.test.ts` — startup env validation, secret strength
- `file-validation.test.ts` — magic-byte detection, type allowlist
- `icu-pluralization.test.ts` — ICU message format edge cases
- `legal-hold-share.test.ts` — legal hold blocks sharing
- `malware-scanner.test.ts` — ClamAV integration + heuristic fallback
- `nowpayments-e2e.test.ts` — crypto payment contract test
- `payment-security.test.ts` — 12-rule payment security model
- `permissions.test.ts` — RBAC + ABAC evaluation
- `policy-engine.test.ts` — ABAC priority, deny-wins, contextual conditions
- `rate-limit.test.ts` — Redis sliding window, bypass tokens
- `security-regression.test.ts` — security bug regression suite
- `semantic-search.test.ts` — embedding + permission filter
- `server-translator.test.ts` — server-side i18n
- `signed-url.test.ts` — HMAC signing, expiry, tamper rejection
- `arabic-search.test.ts` — RTL + Arabic normalization

### End-to-end tests — Playwright

```bash
bun run test:e2e          # headless
bun run test:e2e:ui       # interactive mode
```

**14 tests** across 5 suites:

- `auth.spec.ts` — login, MFA, logout, session expiry
- `documents.spec.ts` — upload, version, share, download
- `audit.spec.ts` — hash-chain verification, CSV export
- `accessibility.spec.ts` — axe-core a11y scan on every page
- `rtl-arabic.spec.ts` — RTL layout + Arabic locale rendering

### Load test

```bash
node tests/load/load-test.js
```

Latest run (10 VUs, 20s):

| Metric | Value |
|--------|-------|
| Total requests | 177 |
| Error rate | 1.13% |
| Throughput | 8.85 req/s |
| Dashboard p99 | 188 ms |
| Health p99 | 104 ms |
| Login p99 | 607 ms |

### Cross-tenant isolation

```bash
bun run scripts/test-isolation.ts
```

A 5-test suite verifying that tenant A cannot read, list, search, download, or audit tenant B's data — by direct API call, by tampered tenant cookie, and by query-parameter injection.

---

## Deployment

### Docker (recommended for production)

The multi-stage `Dockerfile` produces a minimal standalone image:

- **Non-root user** — the app never runs as root
- **Health check** — hits `/api/health` every 30s
- **Undici included** — SSRF DNS pinning ships in the image
- **PWA icon generation** — happens at build time via `sharp`
- **Standalone output** — no `node_modules` in the final image

```bash
# Build
docker build -t smart-edms:1.0.0 .

# Run (single container — pair with external Postgres + Redis)
docker run -p 3000:3000 \
  --env-file .env.production \
  smart-edms:1.0.0
```

For the full local stack (app + worker + Postgres + Redis):

```bash
docker compose up -d
```

### Kubernetes

Six manifest files in `k8s/` cover a production-grade deployment:

| File | Purpose |
|------|---------|
| `namespace.yaml` | Dedicated `smart-edms` namespace |
| `configmap.yaml` | Non-secret configuration |
| `secret.yaml` | Sealed-secret template (replace with your secret manager) |
| `app.yaml` | App Deployment + Service + HPA (web + worker) |
| `infrastructure.yaml` | Postgres StatefulSet + Redis StatefulSet |
| `cronjobs.yaml` | Workflow escalation + billing reconciliation |

See **`k8s/README.md`** for `kubectl apply` ordering and TLS ingress notes.

### Production checklist

1. **Database** — Switch `DATABASE_URL` to PostgreSQL; apply RLS policies from `scripts/rls-policies.sql`.
2. **Storage** — Set `STORAGE_DRIVER=s3` and configure S3 / MinIO / R2 credentials. Enable bucket versioning.
3. **Secrets** — Set `NEXTAUTH_SECRET` and `SMART_EDMS_KEK` (32-byte hex/base64) via your secret manager (Vault, AWS SM, GCP SM). The auto-generated on-disk KEK is **dev only**.
4. **TLS** — Terminate TLS at the load balancer; HSTS is auto-enabled in production.
5. **Backups** — Enable point-in-time Postgres recovery + object-storage versioning. Run `scripts/backup.sh` on a schedule.
6. **Monitoring** — Forward logs to your SIEM; alert on `result=deny` spikes and `audit.verify` failures. Wire Sentry DSN for error tracking.
7. **Rate limits** — Tune Redis-backed limits per route in `src/lib/security/`.
8. **ClamAV** — Point `CLAMAV_HOST` at a ClamAV daemon for malware scanning (heuristic fallback if unset).

---

## Security Posture

Smart EDMS has undergone a comprehensive security review. **125+ findings** have been patched across five severity levels:

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 9 | All patched |
| HIGH | 15 | All patched |
| MEDIUM | 63 | All patched |
| LOW | 38 | All patched |
| Infrastructure | 5 | Patched (with expert-grade hardening) |

### Highlights

- **9 critical fixes** — authentication bypass, privilege escalation, audit-log tampering, SSRF, path traversal, signature forgery, replay attacks, insecure deserialization, KEK exposure
- **12-rule payment security model** — zero client trust, idempotency, HMAC webhook verification, webhook-only business logic, IP allowlist, replay protection, atomic status transitions, underpayment protection, cron reconciliation, invoice expiry, refund safety, audit trail
- **AES-256-GCM envelope encryption** for all secrets at rest (MFA secrets, SSO client secrets, backup codes, step-up tokens) with KEK rotation support and crypto-shredding
- **SSRF DNS pinning** via `undici` — every outbound HTTP request resolves once and pins the IP for the connection
- **Hash-chained audit log** — append-only, SHA-256 chain, one-click integrity verification, CSV export rate-limited and audit-logged
- **Replay-protected MFA** — `mfaLastTimestep` per RFC 6238 §5.2
- **Race-safe step-up tokens** — atomic `updateMany WHERE usedAt=null` prevents token reuse
- **Account lockout on all login paths** — password, SSO, and passkey (previously bypassed on SSO/passkey)

Full details in **[`docs/SECURITY.md`](docs/SECURITY.md)** and the 16 ADRs in **[`docs/adr/`](docs/adr/)**.

### Security notes for operators

1. **Rotate the seed admin password** immediately after first login.
2. **Set `SMART_EDMS_KEK`** to a 32-byte value from your KMS / `openssl rand -hex 32`. The auto-generated on-disk key is **dev only**.
3. **Enable MFA** on all admin accounts (TOTP mandatory for `tenant_admin` in production).
4. **Configure backup retention** — audit logs are append-only and must be retained per your compliance schedule.
5. **Monitor `audit.verify` failures** — they indicate potential tampering.
6. **Restrict outbound network** for the app server except to required services (DB, S3, IdP, payment providers).
7. **Do not log request bodies** in production proxies — they may contain document content.

---

## Internationalization

Smart EDMS is fully internationalized with **next-intl**:

- **5 locales** — English (`en`), French (`fr`), Arabic (`ar` — RTL), Spanish (`es`), German (`de`)
- **1,209 keys per locale** — every user-facing string flows through `t()` calls
- **RTL support** — Arabic layout uses logical CSS properties (`margin-inline-start`, etc.) for proper mirroring
- **ICU pluralization** — server-side translator handles all ICU MessageFormat edge cases
- **Per-tenant overrides** — tenants can customize translations via the admin console
- **AI-assisted translation** — 943 keys translated across the 4 non-English locales with human review
- **Locale detection** — `Accept-Language` header + cookie override + URL prefix

```bash
bun run check:translations    # verify key completeness across locales
```

---

## Progressive Web App

Smart EDMS is a fully installable PWA:

- **Web App Manifest** — `manifest.webmanifest` with name, icons, theme color, display mode
- **Service Worker** — `sw-push.js` for offline fallback + push notification delivery
- **5 app icons** — 192px, 512px, maskable 512px, apple-touch-icon, badge-72px (generated via `sharp`)
- **Offline page** — graceful fallback at `/offline` when the network is unavailable
- **Viewport** — `viewportFit=cover` for notch / safe-area support
- **Installable** — meets Chrome / Edge / Safari installability criteria
- **Push notifications** — Web Push API integration with VAPID keys

---

## Documentation

| Document | Description |
|----------|-------------|
| [Deployment Guide](docs/DEPLOYMENT.md) | Docker, PostgreSQL, S3, SMTP, WebSocket setup |
| [LAN Deployment Guide](docs/LAN-DEPLOYMENT.md) | Enterprise LAN + internet egress (on-premise hybrid) |
| [API Documentation (Swagger)](api-docs) | Interactive OpenAPI 3.1 spec for all 148 endpoints |
| [OpenAPI Spec](docs/openapi.json) | Raw OpenAPI 3.1 JSON |
| [API Auth Guide](docs/API-AUTH.md) | Authentication methods, authorization model, rate limits |
| [Security Policy](SECURITY.md) | How to report vulnerabilities, SLAs, supported versions, scope |
| [Security Architecture](docs/SECURITY.md) | Threat model, encryption, audit, anomaly detection |
| [Security Audit Framework](docs/SECURITY-AUDIT.md) | Third-party audit prep, automated scanning, compliance mapping |
| [E-Signature Integration](docs/E-SIGNATURE.md) | DocuSign and Adobe Sign integration guide |
| [BPMN Workflow Designer](docs/BPMN-DESIGNER.md) | Visual BPMN 2.0 process designer |
| [DoD 5015.02 Records Management](docs/DOD-501502.md) | Records management compliance (15 requirements) |
| [Security Hall of Fame](docs/SECURITY-HALL-OF-FAME.md) | Recognizing security researchers |
| [Operations Runbook](docs/OPERATIONS-RUNBOOK.md) | Incident response, backup/restore, scaling, troubleshooting |
| [PostgreSQL Migration](docs/POSTGRESQL-MIGRATION.md) | SQLite → PostgreSQL with Row-Level Security |
| [Architecture Decision Records](docs/adr/README.md) | 20 ADRs covering key design decisions |
| [Kubernetes Deployment](k8s/README.md) | Manifest ordering, TLS ingress, scaling notes |
| [Backup & Restore](scripts/backup.sh) | Database + storage backup scripts |
| [Deployment Verification](scripts/verify-deployment.sh) | Post-deploy smoke test |
| [Cross-Tenant Isolation Tests](scripts/test-isolation.ts) | 5-test suite verifying tenant isolation |
| [Performance Verification](scripts/performance-verify.ts) | Endpoint latency + throughput check |
| [Glossary (EN/AR)](docs/GLOSSARY-EN-AR.md) | Bilingual records-management terminology |
| [Contributing](CONTRIBUTING.md) | Guidelines, dev setup, code style, commit conventions |
| [Contributing (العربية)](CONTRIBUTING.ar.md) | دليل المساهمة باللغة العربية |
| [Code of Conduct](CODE_OF_CONDUCT.md) | Community standards (Contributor Covenant v2.1) |
| [Code of Conduct (العربية)](CODE_OF_CONDUCT.ar.md) | معايير المجتمع باللغة العربية |
| [Contributors](CONTRIBUTORS.md) | Project maintainers, contributors, and security researchers |
| [Changelog](CHANGELOG.md) | Release history (Keep a Changelog format) |
| [Support](SUPPORT.md) | How to get help — routing table & response times |
| [License](LICENSE) | Full proprietary license (Algerian governing law) |

### Architecture Decision Records

Sixteen ADRs document the reasoning behind major design choices:

1. Next.js App Router over Pages Router
2. Prisma with SQLite-to-Postgres migration path
3. JWT sessions (stateless) over database sessions
4. Argon2id for password hashing
5. AES-256-GCM envelope encryption for secrets at rest
6. SHA-256 hash-chained audit log
7. RBAC + ABAC hybrid authorization
8. Magic-byte MIME validation for uploads
9. WebSocket mini-service for real-time updates
10. AI with mandatory human-in-the-loop
11. Tenant scoping strategy (query-layer + API-layer + audit-layer)
12. Signed URLs instead of direct storage access
13. Redis-backed rate limiting (multi-instance safe)
14. SSRF DNS pinning via undici
15. Billing reconciliation (cron + webhook dual-check)
16. 12-rule payment security model

---

## What This Is NOT

- **Not a qualified e-signature provider** — basic audit-trail signatures only; use a qualified e-signature service for legally binding signatures.
- **Not certified or accredited** to any standard — controls are *aligned with* ISO 27001 / SOC 2 / GDPR / HIPAA, not *certified to*. Achieving formal compliance requires deployment-specific hardening and external audit.
- **Not designed for government-classified material** in non-accredited environments.
- **Not a substitute for an organizational incident-response process** — Smart EDMS provides detection and audit; response is your team's responsibility.
- **Not immutable at the database layer** — application-layer immutability must be reinforced with DB grants and PostgreSQL RLS in production.
- **Not a payment processor** — Smart EDMS integrates with Stripe and NowPayments; PCI scope remains with those providers. Never store full card numbers.

---

## License

**Proprietary — All rights reserved.**

This source is provided for evaluation and authorized deployment only. See the `LICENSE` file for full terms. Unauthorized redistribution, resale, or hosting as a competing service is prohibited.

---

<div align="center">

**Smart EDMS** — *Tamper-evident by design. Private by default. Governed by humans.*

Built with Next.js 16 · TypeScript 5 · Prisma 6 · Tailwind CSS 4

---

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.*

Crafted by [Ahmed Kobbi](https://github.com/ahmedkobbi) — Algerian software engineer.

An Algerian project, engineered to international standards.

🇩🇿

</div>
