# Changelog

All notable changes to Smart EDMS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **صُنع في الجزائر — يخدم العالم** · *Made in Algeria — built for the world.* 🇩🇿

---

## [Unreleased]

Nothing yet. Future releases will be documented here as they ship.

---

## [2.0.0] — 2026-08-11

### Added — Enterprise Feature Pack

#### Feature 1: Third-Party Security Audit Framework
- 3 Prisma models (SecurityAudit, SecurityAuditFinding, SecurityScanResult)
- 6 compliance frameworks (ISO 27001, SOC 2, GDPR, HIPAA, DoD 5015.02, Internal) with 87 pre-mapped controls
- 3 automated scanners (npm-audit, secret detection, config validation)
- Evidence collection (audit chain verification, user access review, permissions matrix)
- Risk scoring (0-100) with weighted severity
- Finding lifecycle: open → in_remediation → remediated → verified
- JSON report export
- 5 API endpoints + 2 admin UI pages
- 14 unit tests
- ADR-017

#### Feature 2: DocuSign / Adobe Sign E-Signature Integration
- 2 Prisma models (SignatureRequest, SignatureEnvelope)
- DocuSign integration (JWT auth, envelope creation, signing URLs, HMAC webhooks)
- Adobe Sign integration (OAuth client credentials, agreement creation, HMAC webhooks)
- Internal provider fallback (in-app signing page at /shared/sign/[id])
- SSRF DNS pinning on all outbound provider API calls
- Step-up auth for voiding requests
- Full audit trail per signature request
- 7 API endpoints (including both provider webhooks) + 1 admin UI page
- 10 unit tests
- ADR-018

#### Feature 3: Visual BPMN Workflow Designer
- 2 Prisma models (BpmnProcessDefinition, BpmnProcessInstance)
- bpmn-js visual modeler with CSS imports for proper rendering
- Custom BPMN 2.0 XML parser (start/end events, user tasks, service tasks, gateways, flows)
- Definition versioning with full history
- Publish → maps BPMN user tasks to WorkflowDefinition approval steps
- Instance management: start, terminate (step-up auth)
- Default BPMN template generator
- 7 API endpoints + 2 admin UI pages
- 10 unit tests
- ADR-019

#### Feature 4: DoD 5015.02 Records Management
- 4 Prisma models (RecordCategory, RecordFolder, VitalRecord, DispositionAuthority)
- 15 DoD 5015.02 requirements mapped (C2.1-C2.9 core, C3.1-C3.6 optional) — all implemented
- Hierarchical file plan (parent/child categories)
- Folder lifecycle: open → cutoff → disposed (destroyed/transferred)
- Legal hold enforcement (blocks disposition)
- Vital records: designation, backup verification, review cycles, due-for-review
- Disposition authorities: NARA GRS, NARA SF, agency-specific, court orders
- JSON compliance report
- 14 API endpoints + 4 admin UI pages
- 18 unit tests
- ADR-020

#### Cross-cutting
- 12 new permissions wired into 7 system roles
- 4 sidebar navigation entries
- i18n keys in all 5 locales (en, fr, ar, es, de)
- Premium glassmorphism UI on all 9 new admin pages
- Environment variables added to .env.example and .env.lan.template
- Feature maintenance cron job (/api/cron/features)
- 4 documentation pages (SECURITY-AUDIT.md, E-SIGNATURE.md, BPMN-DESIGNER.md, DOD-501502.md)
- 52 new unit tests (total now 452, all passing)
- Zero TypeScript errors

### Security
- All new API routes use createApiHandler (auth + RBAC + ABAC + rate-limit + audit)
- Step-up auth on sensitive actions (void signature, publish BPMN, cutoff/dispose folders)
- Hash-chained audit events for all feature actions
- HMAC-SHA256 webhook verification for both DocuSign and Adobe Sign (timing-safe)
- SSRF DNS pinning on all outbound provider API calls

---

## [1.0.0] — 2026-08-11

The inaugural release of Smart EDMS — an Algerian-built, internationally-standards-aligned SaaS Electronic Document Management System. This release ships the complete platform: multi-tenant architecture, tamper-evident audit, classification-driven access control, AI-assisted intelligence with human oversight, dual payment providers, full i18n (5 locales), PWA, and a comprehensive security posture with 125+ findings patched.

### Added

#### Platform & SaaS
- **Multi-tenant SaaS architecture** with tenant scoping at query, API, and audit layers (65 Prisma models)
- **Platform admin tier** — `PLATFORM_ADMIN` role with cross-tenant visibility via `?tenantId=` override (`ctx.targetTenantId`)
- **Tenant lifecycle** — create, suspend, activate, delete with full audit trail across 16 admin routes
- **Public marketing site** at `/` with premium glassmorphism (hero, features, pricing, security highlights)
- **Customer self-registration** at `/signup` — honeypot-protected, rate-limited, email-verified
- **148 REST API endpoints** across 24 route groups, all wrapped by `createApiHandler` (auth + RBAC + rate-limit + audit)
- **Interactive OpenAPI 3.1 spec** at `/api-docs` (Swagger UI) with raw JSON at `docs/openapi.json`

#### Identity & Access
- **Password auth** — Argon2id (memoryCost 19 MiB, OWASP-recommended), 12-char policy, 5-attempt lockout
- **MFA** — TOTP (RFC 6238) with replay protection (`mfaLastTimestep`), AES-256-GCM encrypted secrets, SHA-256 hashed backup codes
- **Step-up auth** — 5-minute tokens (SHA-256 hashed, race-safe `updateMany WHERE usedAt=null`)
- **SSO** — OIDC (PKCE S256) + SAML (`wantAssertionsSigned`, 1-min clock skew), email-domain allowlist for JIT
- **Passkeys / WebAuthn** — `userVerification: 'required'`, AAGUID allowlist, Redis-backed challenge store
- **Sessions** — JWT (8h), `httpOnly` + `sameSite=lax` + `__Secure-` prefix in prod, per-JWT denylist + mass-revoke
- **Account lockout** enforced on password, SSO, and passkey login paths

#### Authorization (RBAC + ABAC)
- **Six system roles** + custom roles with granular `domain:action` permissions (wildcard support)
- **ABAC policy engine** — allow/deny with priority ordering, deny-wins, contextual conditions
- **Server-side enforcement on every route** — UI hiding is never the only control
- **Every authorization decision audit-logged** (allow AND deny with policy trace)

#### Document Lifecycle
- **Upload** — magic-byte MIME validation, TUS resumable uploads, S3 multipart
- **Versioning** — immutable history, SHA-256 + SHA-1 checksums per version
- **Lock/unlock**, soft-delete, record declaration, retention schedules, legal hold
- **Disposition records** with full chain of custody
- **OCR pipeline** — pdfjs-dist rasterization, confidence tracking, franc language detection

#### Classification & Sensitivity
- **Five default levels** (Public → Highly Sensitive) with color-coded visual banners
- **Downgrade controls** — elevated permission + justification, blocked under legal hold
- **Localized taxonomy** — classifications translated per-tenant per-locale

#### Tamper-Evident Audit Log
- **Append-only** at application layer, SHA-256 hash chain (`eventHash = SHA-256(canonical_event || prevHash)`)
- **Per-tenant monotonic sequence numbers**
- **One-click integrity verification** walks the entire chain
- **CSV export** (rate-limited, audit-logged)
- **128 audit event types** × 5 locales (localized labels)

#### Workflow & Approvals
- **Multi-step sequential/parallel approvals** with delegation + escalation hooks
- **Approval signatures** — SHA-256 attestation per approver
- **Dual control** for sensitive operations (two independent approvers)
- **Auto-record declaration** on approval completion

#### Secure Sharing
- **Time-limited signed URLs** — HMAC-SHA256, 60s default expiry
- **Optional password protection** (Argon2id), view-count limits, dynamic watermarking
- **Policy-enforced** — blocked for Restricted / Highly Sensitive

#### AI-Assisted Intelligence (Human-in-the-Loop)
- **Classification suggestions** — heuristic engine + LLM fallback
- **PII / keyword detection** with confidence scoring
- **AI never silently performs**: classification downgrade, deletion, legal-hold removal, access expansion, or export of restricted content
- **All AI actions audit-logged** with source attribution
- **Tenant-level opt-out** via feature flags

#### Collaboration & Search
- **Real-time co-editing** — Hocuspocus + Yjs + TipTap
- **Live presence**, anchored comments
- **OpenSearch semantic search** — vector embeddings + full-text, permission-aware, Arabic analyzers
- **Saved searches** with per-user alerts

#### Billing & Payments
- **Stripe** — card payments, Checkout, subscription management, webhook reconciliation
- **NowPayments** — crypto payments (BTC, ETH, USDT, 50+ assets)
- **12-rule payment security model** (ADR-016): zero client trust, idempotency, HMAC webhook verification, webhook-only business logic, IP allowlist, replay protection, atomic status transitions, underpayment protection, cron reconciliation, invoice expiry, refund safety, audit trail
- **Invoice lifecycle** — generate, pay, reconcile, expire, refund
- **Subscription tiers** with quota enforcement

#### Internationalization
- **5 locales** — English, French, Arabic (RTL), Spanish, German
- **1,209 keys per locale** — every user-facing string flows through `t()`
- **RTL support** via logical CSS properties (`margin-inline-start`, etc.)
- **ICU pluralization** server-side
- **Per-tenant locale overrides** via admin console
- **943 AI-assisted translations** across 4 non-English locales with human review
- **Bilingual glossary** (EN/AR) for records-management terminology

#### Progressive Web App
- **Web App Manifest** + service worker (`sw-push.js`)
- **5 app icons** (192px, 512px, maskable, apple-touch, badge-72px) generated via `sharp`
- **Offline page** at `/offline`, `viewportFit=cover` for notch support
- **Web Push notifications** with VAPID keys

#### UI/UX
- **Glassmorphism** design system (glass, glass-strong, glass-card, dialog-premium, toast-premium)
- **Dark mode** following OS (`enableSystem`, `defaultTheme="system"`)
- **Mobile-first** — bottom navigation, 44px touch targets, safe-area insets, `prefers-reduced-motion`
- **Premium error pages** — 404, 500, 401/403, global-error, loading, API 404 JSON
- **Command palette** (cmdk)
- **Framer Motion + GSAP** animations

#### Infrastructure & DevOps
- **Multi-stage Dockerfile** — non-root user, health check, undici included, PWA icon generation at build time, standalone output
- **6 Kubernetes manifests** — namespace, configmap, secret, app+worker, infrastructure, cronjobs + README
- **Hardened CI/CD** — lint, type-check, unit tests, e2e tests, security audit, Docker build
- **Docker Compose** — full local stack (app + worker + Redis + Postgres) + staging overlay
- **BullMQ + Redis** background job queue with admin monitoring UI

#### Documentation
- **Premium README** (EN + AR) with badges, architecture diagram, full feature catalog
- **16 Architecture Decision Records** (ADRs) covering key design decisions
- **Security Architecture** (`docs/SECURITY.md`) — threat model, encryption, audit, anomaly detection
- **Operations Runbook** (`docs/OPERATIONS-RUNBOOK.md`) — incident response, backup/restore, scaling
- **Deployment Guide**, **API Auth Guide**, **PostgreSQL Migration Guide** (with RLS policies)
- **Bilingual glossary** (EN/AR)

#### Community & Governance
- **Proprietary LICENSE** — Algerian governing law (People's Democratic Republic of Algeria, courts of Algiers), references Law No. 18-07
- **Security Policy** (`SECURITY.md`) — private advisory workflow, 72h/7-day SLAs, severity-based fix targets, coordinated disclosure
- **Contributing guide** (EN + AR) — dev setup, code style, Conventional Commits, CoC
- **Code of Conduct** — Contributor Covenant v2.1 with Algerian origin note
- **Support routing** (`SUPPORT.md`) — channel mapping, response times, commercial support
- **GitHub issue templates** — bug report, feature request, security report redirect, config with contact links
- **Pull request template** with 11-point checklist
- **CODEOWNERS** — security-critical paths always reviewed by author
- **FUNDING.yml** — GitHub Sponsors
- **Dependabot** config — npm + GitHub Actions, grouped updates, major-bump ignores
- **CodeQL** workflow — weekly scan, security-extended query suite, SARIF upload
- **Dependency Review** workflow — blocks HIGH/CRITICAL vulns, denies GPL/AGPL/SSPL/BUSL

### Security

- **125+ security findings patched** across 5 severity levels:
  - **9 CRITICAL** — authentication bypass, privilege escalation, audit-log tampering, SSRF, path traversal, signature forgery, replay attacks, insecure deserialization, KEK exposure
  - **15 HIGH** — across auth, documents, billing, admin, infrastructure
  - **63 MEDIUM** — across all subsystems
  - **38 LOW** — hardening and defense-in-depth
  - **5 Infrastructure** — expert-grade hardening
- **AES-256-GCM envelope encryption** for all secrets at rest (MFA secrets, SSO client secrets, backup codes, step-up tokens) with KEK rotation and crypto-shredding
- **SSRF DNS pinning** via `undici` on all outbound HTTP requests
- **Hash-chained audit log** — append-only, SHA-256, one-click integrity verification
- **Replay-protected MFA** per RFC 6238 §5.2
- **Race-safe step-up tokens** — atomic `updateMany WHERE usedAt=null`
- **Account lockout on all login paths** (password, SSO, passkeys — previously bypassed on SSO/passkey)
- **Zero client trust** — security-critical fields re-derived server-side
- **Webhook-only business logic** for payment activation
- **Strict CSP**, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `X-Content-Type-Options`
- **CSRF protection** via NextAuth
- **Path-traversal protection** in storage layer
- **File type allowlist + magic-byte validation**
- **ClamAV malware scanning** with heuristic fallback
- **Browser push notifications** (Web Push API)

### Performance

- **Production load test** — 10 VUs, 177 requests, 1.13% error rate, 8.85 req/s throughput
  - Dashboard p99: 188 ms
  - Health p99: 104 ms
  - Login p99: 607 ms
- **Cached semantic search** with OpenSearch
- **Standalone Next.js output** — no `node_modules` in production image
- **Redis-backed rate limiting** (multi-instance safe)

### Tests

- **400+ unit tests** (Vitest) covering audit hash chain, auth lifecycle, billing policy, envelope encryption, file validation, payment security, permissions, policy engine, rate limiting, security regression, semantic search, signed URLs, and more
- **14 end-to-end tests** (Playwright) across 5 suites: auth, documents, audit, accessibility (axe-core), RTL Arabic
- **Cross-tenant isolation suite** — 5 tests verifying tenant A cannot access tenant B's data
- **Load test** with results persisted
- **Translation completeness CI check** — all 5 locales verified at 100% (1,209 keys each)

### Algerian Identity

- **Algerian governing law** in the LICENSE (courts of Algiers, Law No. 18-07 referenced)
- **Compliance posture** aligned with ISO 27001, SOC 2, GDPR, HIPAA, and Algeria's Law No. 18-07 (ARPDD oversight)
- **Bilingual signatures** throughout — صُنع في الجزائر — يخدم العالم / Made in Algeria — built for the world
- **Arabic README** (`README.ar.md`) — full RTL translation
- **Arabic CONTRIBUTING** (`CONTRIBUTING.ar.md`) — full RTL translation
- **Cultural framing** — medinas of Algiers, Constantine, Tlemcen craftsmanship ethos applied to cryptographic rigor

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **MAJOR** (X.0.0) — incompatible API or data-model changes
- **MINOR** (1.X.0) — new features, backward-compatible
- **PATCH** (1.0.X) — bug fixes, backward-compatible

Security fixes are backported to the latest tagged release when feasible.

[Unreleased]: https://github.com/ahmedkobbi/smart-edms/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ahmedkobbi/smart-edms/releases/tag/v1.0.0
