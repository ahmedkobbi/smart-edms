# Smart EDMS v1.0.0 — Inaugural Release

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.* 🇩🇿

**An Algerian-built, internationally-standards-aligned SaaS Document Management System.**

*Tamper-evident by design. Private by default. Governed by humans.*

</div>

---

## About

Smart EDMS is a production-grade, multi-tenant SaaS Electronic Document Management System built with Next.js 16, TypeScript, and Prisma. It provides tamper-evident audit trails, classification-driven access control, retention/legal-hold governance, and AI-assisted document intelligence with mandatory human oversight.

This is the inaugural release — the culmination of 75 commits spanning application code, security hardening, internationalization, PWA, infrastructure, and comprehensive governance documentation.

---

## At a Glance

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  334  TypeScript source files          148  REST API endpoints       │
 │   65  Prisma data models               51  Application pages         │
 │   68  React UI components              400+  Unit tests passing       │
 │   14  End-to-end tests                   5  Locales (en/fr/ar/es/de) │
 │ 125+  Security findings patched        16  Architecture Decisions    │
 │   12  Payment-security rules         1,209  i18n keys per locale     │
 │   75  Commits                           18  Governance documents     │
 └──────────────────────────────────────────────────────────────────────┘
```

---

## Highlights

### Platform & SaaS
- **Multi-tenant architecture** with tenant scoping at query, API, and audit layers
- **Platform admin tier** — `PLATFORM_ADMIN` role with cross-tenant visibility
- **Tenant lifecycle** — create, suspend, activate, delete with full audit trail
- **Public marketing site** + customer self-registration
- **148 REST API endpoints** across 24 route groups

### Security (125+ findings patched)
- **9 CRITICAL, 15 HIGH, 63 MEDIUM, 38 LOW, 5 infrastructure** findings patched
- **Hash-chained audit log** — SHA-256, append-only, one-click integrity verification
- **Zero client trust** — security-critical fields re-derived server-side
- **AES-256-GCM envelope encryption** for all secrets at rest, with crypto-shredding
- **SSRF DNS pinning** via `undici` on all outbound requests
- **12-rule payment security model** (ADR-016) for Stripe and NowPayments
- **Replay-protected MFA** per RFC 6238 §5.2
- **Race-safe step-up tokens** — atomic `updateMany WHERE usedAt=null`
- **Account lockout on all login paths** (password, SSO, passkeys)

### Identity & Access
- **Argon2id** password hashing (OWASP-recommended)
- **TOTP MFA** with replay protection, AES-256-GCM encrypted secrets
- **SSO** — OIDC (PKCE S256) + SAML (`wantAssertionsSigned`)
- **Passkeys / WebAuthn** — `userVerification: 'required'`
- **RBAC + ABAC** — six system roles + custom roles + contextual policies

### Document Lifecycle
- **TUS resumable uploads**, S3 multipart, magic-byte MIME validation
- **Immutable versioning** with SHA-256 + SHA-1 checksums
- **Record declaration**, retention schedules, legal hold, disposition records
- **OCR pipeline** — pdfjs-dist, confidence tracking, franc language detection

### AI with Human Oversight
- **Classification suggestions** (heuristic + LLM fallback)
- **PII / keyword detection** with confidence scoring
- **AI never silently performs**: downgrades, deletions, legal-hold removals, access expansions

### Billing & Payments
- **Stripe** (card) + **NowPayments** (crypto — BTC, ETH, USDT, 50+ assets)
- **Invoice lifecycle** — generate, pay, reconcile, expire, refund
- **Subscription tiers** with quota enforcement

### Internationalization
- **5 locales** — English, French, Arabic (RTL), Spanish, German
- **1,209 keys per locale** — 100% complete
- **RTL support** via logical CSS properties
- **ICU pluralization**, per-tenant locale overrides
- **Bilingual glossary** (EN/AR)

### PWA & UX
- **Installable PWA** — manifest, service worker, 5 app icons, offline page
- **Glassmorphism** design system, dark mode (follows OS)
- **Mobile-first** — bottom nav, 44px touch targets, safe-area insets
- **Premium error pages** — 404, 500, 401/403, global-error

### Infrastructure
- **Multi-stage Dockerfile** — non-root, health check, standalone output
- **6 Kubernetes manifests** + README
- **Hardened CI/CD** — lint, type-check, unit, e2e, security audit, Docker build
- **CodeQL** + **Dependabot** + **Dependency Review** workflows
- **Load-tested** — 10 VUs, 177 requests, 1.13% error rate, dashboard p99 188ms

### Documentation & Governance
- **Premium README** (EN + AR) with badges, architecture, full feature catalog
- **16 ADRs**, Security Architecture, Operations Runbook, Deployment Guide
- **Proprietary LICENSE** — Algerian governing law (Law No. 18-07 referenced)
- **SECURITY.md** — private advisory workflow, 72h/7-day SLAs
- **CONTRIBUTING** (EN + AR), **CODE_OF_CONDUCT** (EN + AR), **SUPPORT**
- **CHANGELOG**, **CONTRIBUTORS**, **Security Hall of Fame**
- **GitHub issue/PR templates**, **CODEOWNERS**, **FUNDING.yml**

---

## Algerian Identity

Smart EDMS is an **Algerian project**, conceived and engineered to meet international standards.

- **Governing law**: People's Democratic Republic of Algeria (courts of Algiers)
- **Compliance**: aligned with ISO 27001, SOC 2, GDPR, HIPAA, and Algeria's Law No. 18-07 (ARPDD oversight)
- **Bilingual signatures**: صُنع في الجزائر — يخدم العالم / Made in Algeria — built for the world
- **Arabic documentation**: README.ar.md, CONTRIBUTING.ar.md, CODE_OF_CONDUCT.ar.md
- **Cultural framing**: medinas of Algiers, Constantine, Tlemcen craftsmanship ethos applied to cryptographic rigor

> *Algerian by origin. International by standard. Universal by design.*

---

## Installation

```bash
git clone https://github.com/ahmedkobbi/smart-edms.git
cd smart-edms
bun install
cp .env.example .env  # set NEXTAUTH_SECRET, SMART_EDMS_KEK, DATABASE_URL
bun run db:push
bun run seed
bun run dev
```

Default admin: `admin@smartedms.local` / `ChangeMe!2025` (change immediately)

---

## Full Changelog

See [CHANGELOG.md](https://github.com/ahmedkobbi/smart-edms/blob/main/CHANGELOG.md) for the complete release notes.

---

<div align="center">

**Smart EDMS** — *Tamper-evident by design. Private by default. Governed by humans.*

Crafted by [Ahmed Kobbi](https://github.com/ahmedkobbi) — Algerian software engineer. 🇩🇿

</div>
