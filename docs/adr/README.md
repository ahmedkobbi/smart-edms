# Architecture Decision Records (ADRs)

This directory contains ADRs for Smart EDMS. Each ADR documents a key architectural decision, its context, and consequences.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](./001-nextjs-app-router.md) | Use Next.js 16 App Router | Accepted |
| [ADR-002](./002-prisma-sqlite-to-postgres.md) | Prisma ORM with SQLite (dev) → PostgreSQL (prod) | Accepted |
| [ADR-003](./003-jwt-sessions-not-database.md) | JWT sessions over database sessions | Accepted |
| [ADR-004](./004-argon2id-password-hashing.md) | Argon2id for password hashing | Accepted |
| [ADR-005](./005-envelope-encryption.md) | Per-document envelope encryption | Accepted |
| [ADR-006](./006-hash-chained-audit.md) | SHA-256 hash-chained audit log | Accepted |
| [ADR-007](./007-rbac-plus-abac.md) | RBAC + ABAC hybrid authorization | Accepted |
| [ADR-008](./008-magic-byte-validation.md) | Magic-byte MIME validation | Accepted |
| [ADR-009](./009-websocket-mini-service.md) | WebSocket as separate mini-service | Accepted |
| [ADR-010](./010-ai-human-in-loop.md) | AI with mandatory human-in-the-loop | Accepted |
| [ADR-011](./011-tenant-scoping-strategy.md) | Tenant scoping via application + RLS | Accepted |
| [ADR-012](./012-signed-urls-not-direct-storage.md) | HMAC-signed URLs for file access | Accepted |
| [ADR-013](./013-redis-rate-limiting.md) | Redis-backed rate limiting + challenge stores | Accepted |
| [ADR-014](./014-ssrf-dns-pinning.md) | SSRF DNS pinning via undici Agent | Accepted |
| [ADR-015](./015-billing-reconciliation.md) | Billing reconciliation (Stripe + NowPayments) | Accepted |
| [ADR-016](./016-payment-security-model.md) | Payment security model (12 rules) | Accepted |

## Format

Each ADR follows:
- **Title**: Short noun phrase
- **Status**: Proposed | Accepted | Deprecated | Superseded
- **Context**: Why this decision was needed
- **Decision**: What was decided
- **Consequences**: Positive + negative impacts
- **Alternatives considered**: What was rejected and why
