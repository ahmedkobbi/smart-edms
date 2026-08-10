# ADR-015: Billing Reconciliation (Stripe + NowPayments)

## Status
Accepted

## Date
2026-08-10

## Context

The original `PATCH /api/admin/billing` endpoint accepted arbitrary plan/seats/storage changes from any `tenant_admin`. A tenant admin could self-upgrade from `trial` to `enterprise` with 10 000 seats and 1 TB storage. The audit log recorded the change but did not block it.

The pentest report flagged this as L-ADM-6 (LOW, deferred).

When the NowPayments crypto checkout was added, the billing system needed to support two payment providers (Stripe for cards, NowPayments for crypto) with a unified security model.

## Decision

Implement a 4-layer billing policy in `src/lib/billing/billing-policy.ts`:

### Layer 1: Permission Gate
- New permission `ADMIN_PLATFORM_BILLING_MANAGE` — only platform admins can change billing via PATCH.
- `tenant_admin` can VIEW billing but NOT modify.
- Blocked attempts trigger `security.billing_self_upgrade_blocked` audit event + notify all tenant_admins.

### Layer 2: Stripe Webhook Reconciliation
- `POST /api/billing/webhook` — receives Stripe events.
- HMAC-SHA256 signature verification with 5-min replay window.
- Maps Stripe price ID → local plan name via env vars.
- `applyStripeSubscriptionUpdate()` finds subscription by `stripeCustomerId` / `stripeSubscriptionId` and updates.

### Layer 3: NowPayments Crypto Checkout
- `POST /api/billing/checkout` — creates a `PaymentInvoice` with server-side price.
- `POST /api/billing/webhook/nowpayments` — receives NowPayments IPN events.
- HMAC-SHA256 signature verification over sorted+concatenated JSON values.
- IP allowlist (defense-in-depth).
- Status machine: `pending → waiting → confirming → confirmed | failed | expired | refunded`.

### Layer 4: Plan-Transition Policy + Limits
- `isPlanTransitionAllowed()` — multi-tier upgrades flagged as suspicious.
- `validatePlanLimits()` — per-plan seats + storage caps.
- Over-limit requests rejected with 400.

### Cron Reconciliation
- `GET /api/cron/billing-reconcile` — hourly sync with NowPayments API for missed webhooks + expire stale invoices.

## Consequences

**Positive:**
- `tenant_admin` cannot self-upgrade — revenue protection.
- Two payment providers (Stripe + NowPayments) with unified security model.
- Missed webhooks are caught by cron reconciliation.
- Suspicious transitions (multi-tier jumps, downgrades to trial) are logged for forensic review.

**Negative:**
- Platform admin must be provisioned separately (not a tenant_admin role).
- Stripe price ID → plan mapping requires env var configuration per deployment.
- The cron reconciliation adds 1 API call per pending invoice per hour.

## Alternatives Considered

1. **Stripe only** — doesn't support crypto payments (user requirement).
2. **NowPayments only** — doesn't support card payments (enterprise requirement).
3. **Manual billing only** — no self-service checkout; doesn't scale.
