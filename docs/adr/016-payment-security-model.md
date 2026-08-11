# ADR-016: Payment Security Model

## Status
Accepted

## Date
2026-08-10

## Context

When adding NowPayments crypto checkout, the user specified strict payment security rules that must apply to ALL payment methods (not just NowPayments):

1. Zero client trust — never trust client-side prices
2. Idempotency — prevent duplicate transactions
3. Webhook verification — signature verification to prevent spoofing
4. Trigger business logic via webhooks only — never return URLs
5. Additional advanced scenarios

## Decision

Implement a 12-rule payment security model in `src/lib/billing/payment-service.ts` + `src/lib/billing/billing-policy.ts`:

### Rule 1: Zero Client Trust
The client sends `{ plan, billingCycle, payCurrency, idempotencyKey }` — never a price. The server reads the price from `PLAN_PRICES_USD` (server-side table) and writes `amountUsd` to the `PaymentInvoice` row. Even if an attacker intercepts the request, they cannot change the amount charged.

### Rule 2: Idempotency
`idempotencyKey` (client-supplied UUID) has a DB UNIQUE constraint. Duplicate requests (network retry, double-click) return the existing invoice. Race-safe: P2002 (unique violation) caught and re-queried.

### Rule 3: Webhook Signature Verification
- **NowPayments**: HMAC-SHA256 over sorted+concatenated JSON values, sent in `x-nowpayments-sig` header. Constant-time comparison.
- **Stripe**: HMAC-SHA256 over raw body, sent in `Stripe-Signature` header. 5-min replay window.
- Both use `crypto.timingSafeEqual` to prevent timing-based signature extraction.
- Failed signatures are audit-logged (`payment.webhook_signature_failed`).

### Rule 4: Webhook-Only Business Logic
Subscription activation runs ONLY in webhook handlers — NEVER on the return URL. `GET /api/billing/return` is DISPLAY ONLY: it reads the invoice status from the DB (written by the webhook) and redirects the user to the billing dashboard. It never mutates the subscription, never transitions the invoice status, and never trusts query params other than `invoice_id`.

### Rule 5: IP Allowlist (Defense-in-Depth)
When `NOWPAYMENTS_ALLOWED_IPS` is configured, webhooks from any other IP are rejected with 403. The HMAC is the primary auth gate; the IP check catches the case where the HMAC secret has leaked but the attacker hasn't yet forged a signature from a NowPayments IP.

### Rule 6: Replay Protection
Each webhook delivery is deduplicated by a synthesized event ID `${payment_id}:${payment_status}`. The `PaymentInvoice.processedWebhooks` field stores every processed event ID (capped at 100 entries). Duplicate deliveries (NowPayments retries on 5xx) are no-ops.

### Rule 7: Atomic Status Transitions
Status changes use `updateMany WHERE id = ? AND status = fromStatus` so two concurrent webhooks cannot both transition the invoice. Only one wins (count=1); the other gets count=0 and is a no-op. The status machine (`ALLOWED_STATUS_TRANSITIONS`) rejects invalid transitions (e.g. `confirmed` → `pending`).

### Rule 8: Underpayment Protection
The webhook only transitions to `confirmed` when `actually_paid >= pay_amount`. Partial payments stay in `confirming` until the full amount arrives or the invoice expires.

### Rule 9: Cron Reconciliation
Hourly cron queries the NowPayments API for every pending/waiting/confirming invoice and syncs the status — catches missed webhooks. Also expires stale invoices.

### Rule 10: Invoice Expiry
Crypto invoices expire (typically 20-30 min). The cron marks expired invoices as `expired` and never activates the subscription. Prevents holding invoices open indefinitely.

### Rule 11: Refund Safety
Refunds require platform-admin permission + step-up auth. Never automatic. Subscription downgraded to `past_due` (not canceled — tenant admin may want to re-subscribe). Every refund is audit-logged with actor + reason.

### Rule 12: Audit Trail
Every status change is recorded as an audit event with the actor (user/system/webhook/provider), the from/to status, the webhook event ID, and the amount. Complete forensic trail for every payment.

## Consequences

**Positive:**
- All 5 user-specified rules enforced + 7 additional advanced scenarios.
- Payment security model is provider-agnostic — adding a new payment provider only requires implementing the webhook verifier + status mapper.
- Complete audit trail for compliance (PCI DSS, SOC 2).
- No card data ever touches our servers (NowPayments hosts the payment page; Stripe handles card data via Stripe.js).

**Negative:**
- The 12-rule model adds complexity — 6 new API routes + 3 new lib modules.
- The cron reconciliation adds hourly API calls to NowPayments (rate-limited by their API).
- Refunds require manual platform-admin intervention (by design — never automatic).

## Alternatives Considered

1. **Trust NowPayments' return URL** — vulnerable to tampering (attacker crafts `/return?status=confirmed`).
2. **Polling instead of webhooks** — higher latency, more API calls, doesn't scale.
3. **Single provider** — doesn't meet the user requirement for both card + crypto.
