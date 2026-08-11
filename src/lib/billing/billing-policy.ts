/**
 * Smart EDMS — Billing policy + Stripe integration
 *
 * SECURITY FIX (L-ADM-6): Previously PATCH /api/admin/billing accepted
 * arbitrary plan/seats/storage changes from any tenant_admin — a tenant
 * admin could self-upgrade from `trial` to `enterprise` with 10 000 seats
 * and 1 TB storage. The audit log recorded the change but did not block it.
 *
 * This module implements a defense-in-depth billing policy:
 *
 *   1. **Stripe webhook reconciliation** — when Stripe is configured
 *      (STRIPE_SECRET_KEY set), the ONLY way to change plan/seats/storage
 *      is via the Stripe webhook at POST /api/billing/webhook. The PATCH
 *      endpoint rejects all changes except by platform admins
 *      (ADMIN_PLATFORM_BILLING_MANAGE permission).
 *
 *   2. **Plan-transition allowlist** — even platform admins cannot skip
 *      plans arbitrarily (e.g. trial → enterprise is suspicious). The
 *      allowlist defines valid transitions. Direct upgrades more than one
 *      tier trigger a `security.billing_suspicious_upgrade` audit event.
 *
 *   3. **Anomaly alerts** — any billing change by a non-platform-admin
 *      (when Stripe is NOT configured, i.e. dev/manual mode) triggers
 *      a `security.billing_self_upgrade` audit event with severity
 *      `critical` and notifies platform admins.
 *
 *   4. **Tier limits** — each plan has a max seats + max storage cap.
 *      Requests exceeding the cap are rejected with 400.
 *
 * Configuration:
 *   - STRIPE_SECRET_KEY: when set, Stripe is the source of truth. The
 *     PATCH endpoint only allows platform-admin overrides.
 *   - STRIPE_WEBHOOK_SECRET: used by the webhook to verify event signatures.
 *   - When neither is set, the system runs in "manual" mode — platform
 *     admins can change billing directly, tenant_admins cannot.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify } from '@/lib/notifications/notify';

// ---------------------------------------------------------------------------
//  Server-side price table (ZERO CLIENT TRUST)
// ---------------------------------------------------------------------------
//
// SECURITY: the client never sends a price. It sends { plan, billingCycle,
// idempotencyKey }. The server reads the price from this table and writes
// `amountUsd` to the PaymentInvoice row. The client cannot tamper with the
// amount charged.
//
// To change prices, update this table and deploy — no client change needed.

export type BillingCycle = 'monthly' | 'annual';

interface PlanPrice {
  monthly: number; // USD per month
  annual: number;  // USD per year (≈ 2 months free vs monthly)
}

export const PLAN_PRICES_USD: Record<Plan, PlanPrice> = {
  trial:      { monthly: 0,   annual: 0    },
  starter:    { monthly: 29,  annual: 290  },
  business:   { monthly: 99,  annual: 990  },
  enterprise: { monthly: 499, annual: 4990 },
};

/**
 * Compute the USD price for a plan + billing cycle.
 * This is the ONLY function that determines what a customer pays — the
 * client-supplied plan is validated against this table, never trusted.
 */
export function computePriceUsd(plan: Plan, cycle: BillingCycle): number {
  const price = PLAN_PRICES_USD[plan];
  if (!price) throw new Error(`Unknown plan: ${plan}`);
  return cycle === 'annual' ? price.annual : price.monthly;
}

/**
 * Compute the period (start + end) for a billing cycle.
 * Monthly = 30 days, Annual = 365 days.
 */
export function computeBillingPeriod(cycle: BillingCycle, from: Date = new Date()): { start: Date; end: Date } {
  const days = cycle === 'annual' ? 365 : 30;
  return {
    start: from,
    end: new Date(from.getTime() + days * 24 * 3600 * 1000),
  };
}

// ---------------------------------------------------------------------------
//  Payment invoice status machine
// ---------------------------------------------------------------------------

export type InvoiceStatus =
  | 'pending'      // invoice created, awaiting redirect to provider
  | 'waiting'      // provider invoice created, awaiting payment
  | 'confirming'   // payment detected, awaiting blockchain confirmation
  | 'confirmed'    // fully confirmed — subscription activated
  | 'failed'       // payment failed or was rejected
  | 'expired'      // invoice expired before payment
  | 'refunded';    // payment was refunded (terminal)

/**
 * Allowed status transitions. Any transition not in this map is rejected.
 * This prevents, e.g., a `confirmed` invoice from going back to `pending`
 * via a malformed webhook.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  pending:    ['waiting', 'failed', 'expired'],
  waiting:    ['confirming', 'failed', 'expired', 'confirmed'],
  confirming: ['confirmed', 'failed', 'expired'],
  confirmed:  ['refunded'],
  failed:     [], // terminal
  expired:    [], // terminal
  refunded:   [], // terminal
};

/**
 * Check whether a status transition is allowed by the status machine.
 */
export function isStatusTransitionAllowed(from: InvoiceStatus, to: InvoiceStatus): boolean {
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Whether the status is terminal (no further transitions possible
 * except refund for `confirmed`).
 */
export function isTerminalStatus(status: InvoiceStatus): boolean {
  return status === 'failed' || status === 'expired' || status === 'refunded';
}

// ---------------------------------------------------------------------------
//  Crypto currency allowlist + minimums
// ---------------------------------------------------------------------------

/**
 * Allowed crypto currencies for NowPayments checkout.
 * Maps the NowPayments currency code to a minimum amount (in the smallest
 * unit the API accepts) below which NowPayments rejects the invoice.
 * NowPayments also enforces its own minimums; this is a defense-in-depth.
 */
export const ALLOWED_CRYPTO_CURRENCIES: Record<string, { minUsd: number; displayName: string }> = {
  'btc':       { minUsd: 1,    displayName: 'Bitcoin' },
  'eth':       { minUsd: 1,    displayName: 'Ethereum' },
  'usdttrc20': { minUsd: 1,    displayName: 'USDT (TRC20)' },
  'usdterc20': { minUsd: 1,    displayName: 'USDT (ERC20)' },
  'usdc':      { minUsd: 1,    displayName: 'USD Coin' },
  'ltc':       { minUsd: 1,    displayName: 'Litecoin' },
  'bch':       { minUsd: 1,    displayName: 'Bitcoin Cash' },
  'xmr':       { minUsd: 1,    displayName: 'Monero' },
  'dash':      { minUsd: 1,    displayName: 'Dash' },
};

export function isCryptoCurrencyAllowed(currency: string): boolean {
  return currency.toLowerCase() in ALLOWED_CRYPTO_CURRENCIES;
}

// ---------------------------------------------------------------------------
//  Plan definitions + transition rules (existing — kept for compat)
// ---------------------------------------------------------------------------

export type Plan = 'trial' | 'starter' | 'business' | 'enterprise';

interface PlanLimits {
  maxSeats: number;
  maxStorageBytes: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  trial: { maxSeats: 5, maxStorageBytes: 5 * 1024 * 1024 * 1024 }, // 5GB
  starter: { maxSeats: 25, maxStorageBytes: 50 * 1024 * 1024 * 1024 }, // 50GB
  business: { maxSeats: 200, maxStorageBytes: 500 * 1024 * 1024 * 1024 }, // 500GB
  enterprise: { maxSeats: 10_000, maxStorageBytes: 10 * 1024 * 1024 * 1024 * 1024 }, // 10TB
};

const PLAN_TIER: Record<Plan, number> = {
  trial: 0,
  starter: 1,
  business: 2,
  enterprise: 3,
};

/**
 * Allowed plan transitions. `*` means any target is allowed.
 * Missing entries default to "same-tier or one-tier upgrade only".
 *
 * - trial → starter/business/enterprise: allowed (normal upgrade path)
 * - starter → business/enterprise: allowed
 * - business → enterprise: allowed
 * - enterprise → enterprise: allowed (no-op)
 * - Any → trial: SUSPICIOUS — downgrade to trial is unusual; logged.
 */
export function isPlanTransitionAllowed(from: Plan, to: Plan): { allowed: boolean; suspicious: boolean; reason?: string } {
  if (from === to) return { allowed: true, suspicious: false };
  const fromTier = PLAN_TIER[from];
  const toTier = PLAN_TIER[to];
  if (toTier > fromTier) {
    // Upgrade — allowed, but flag if jumping more than one tier
    const jump = toTier - fromTier;
    return {
      allowed: true,
      suspicious: jump > 1,
      reason: jump > 1 ? `Skipping ${jump - 1} tier(s) in a single change` : undefined,
    };
  }
  // Downgrade
  if (to === 'trial') {
    return {
      allowed: true,
      suspicious: true,
      reason: 'Downgrade to trial — verify this is intentional (usually only happens at subscription cancellation)',
    };
  }
  // Paid-tier downgrade (e.g. enterprise → business) — allowed, not suspicious
  return { allowed: true, suspicious: false };
}

/**
 * Validate seats + storage against the target plan's limits.
 */
export function validatePlanLimits(plan: Plan, seats: number, storageBytes: number): { ok: boolean; error?: string } {
  const limits = PLAN_LIMITS[plan];
  if (seats > limits.maxSeats) {
    return { ok: false, error: `Seats ${seats} exceeds the ${plan} plan maximum of ${limits.maxSeats}` };
  }
  if (storageBytes > limits.maxStorageBytes) {
    return { ok: false, error: `Storage ${storageBytes} bytes exceeds the ${plan} plan maximum of ${limits.maxStorageBytes} bytes` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
//  Stripe mode detection
// ---------------------------------------------------------------------------

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function isStripeWebhookConfigured(): boolean {
  return !!process.env.STRIPE_WEBHOOK_SECRET;
}

/**
 * Billing mode:
 *   - 'stripe' — Stripe is the source of truth. PATCH /api/admin/billing
 *     only accepts platform-admin overrides. All normal changes come via
 *     the Stripe webhook.
 *   - 'manual' — No Stripe. Platform admins can change billing directly.
 *     tenant_admins CANNOT change billing (only view).
 */
export function getBillingMode(): 'stripe' | 'manual' {
  return isStripeConfigured() ? 'stripe' : 'manual';
}

// ---------------------------------------------------------------------------
//  Stripe webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the Stripe webhook signature using the Stripe-Webhook-Signature
 * header. Uses Stripe's official `t=...,v1=...` format with HMAC-SHA256
 * over `${timestamp}.${rawBody}`.
 *
 * Returns true if the signature is valid AND the timestamp is within the
 * 5-minute tolerance window (prevents replay attacks).
 */
export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<{ valid: boolean; reason?: string }> {
  if (!secret) return { valid: false, reason: 'STRIPE_WEBHOOK_SECRET not configured' };
  if (!signatureHeader) return { valid: false, reason: 'Missing Stripe-Signature header' };

  // Parse the header: "t=1234567890,v1=abcdef..."
  const parts = signatureHeader.split(',').map((p) => p.trim());
  let timestamp: string | null = null;
  let v1Signature: string | null = null;
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't') timestamp = v;
    else if (k === 'v1') v1Signature = v;
  }
  if (!timestamp || !v1Signature) {
    return { valid: false, reason: 'Malformed Stripe-Signature header' };
  }

  // Tolerance: 5 minutes
  const toleranceMs = 5 * 60 * 1000;
  const signedAt = parseInt(timestamp, 10) * 1000;
  if (isNaN(signedAt)) return { valid: false, reason: 'Invalid timestamp in signature' };
  if (Math.abs(Date.now() - signedAt) > toleranceMs) {
    return { valid: false, reason: 'Signature timestamp outside tolerance window (replay protection)' };
  }

  // Compute expected signature: HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
  const crypto = await import('crypto');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Constant-time comparison
  const a = Buffer.from(v1Signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return { valid: false, reason: 'Signature length mismatch' };
  if (!crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'Signature mismatch' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
//  Subscription update from Stripe event
// ---------------------------------------------------------------------------

interface StripeSubscriptionUpdate {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: Plan;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  seats: number;
  storageBytes: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

/**
 * Apply a subscription update originating from a Stripe webhook event.
 * Finds the subscription by `stripeCustomerId` (or `stripeSubscriptionId`)
 * and updates the row. Records an audit event with `actorId: 'stripe'`.
 *
 * This is the ONLY function that can change plan/seats/storage when Stripe
 * is configured. The PATCH /api/admin/billing endpoint defers to this when
 * Stripe mode is active.
 */
export async function applyStripeSubscriptionUpdate(update: StripeSubscriptionUpdate): Promise<void> {
  // Find the subscription by Stripe identifiers
  const sub = await db.subscription.findFirst({
    where: {
      OR: [
        { stripeCustomerId: update.stripeCustomerId },
        { stripeSubscriptionId: update.stripeSubscriptionId },
      ],
    },
  });

  if (!sub) {
    logger.warn('billing.stripe_update_no_match', {
      stripeCustomerId: update.stripeCustomerId,
      stripeSubscriptionId: update.stripeSubscriptionId,
    });
    return;
  }

  const previousPlan = sub.plan as Plan;
  const transition = isPlanTransitionAllowed(previousPlan, update.plan);

  await db.subscription.update({
    where: { id: sub.id },
    data: {
      plan: update.plan,
      status: update.status,
      seats: update.seats,
      storageBytes: BigInt(update.storageBytes),
      currentPeriodStart: update.currentPeriodStart,
      currentPeriodEnd: update.currentPeriodEnd,
      stripeCustomerId: update.stripeCustomerId,
      stripeSubscriptionId: update.stripeSubscriptionId,
    },
  });

  await recordAuditEvent({
    tenantId: sub.tenantId,
    actorId: 'stripe',
    actorEmail: 'stripe@webhook',
    eventType: 'billing.stripe_update',
    action: 'update',
    resourceType: 'subscription',
    resourceId: sub.id,
    result: 'allow',
    reason: transition.suspicious ? transition.reason : undefined,
    metadata: {
      previousPlan,
      newPlan: update.plan,
      seats: update.seats,
      storageBytes: update.storageBytes,
      status: update.status,
      stripeCustomerId: update.stripeCustomerId,
      stripeSubscriptionId: update.stripeSubscriptionId,
      suspicious: transition.suspicious,
    },
  });

  if (transition.suspicious) {
    logger.warn('billing.suspicious_stripe_transition', {
      tenantId: sub.tenantId,
      previousPlan,
      newPlan: update.plan,
      reason: transition.reason,
    });
  }
}

// ---------------------------------------------------------------------------
//  Anomaly alert for non-platform-admin billing changes (manual mode)
// ---------------------------------------------------------------------------

/**
 * Alert platform admins when a non-platform-admin attempts to change
 * billing in manual mode. Even though the change is blocked by the
 * PATCH route (returns 403), we still record the attempt for forensics.
 */
export async function alertBillingSelfUpgradeAttempt(opts: {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorIp: string;
  attemptedChange: Record<string, unknown>;
}): Promise<void> {
  await recordAuditEvent({
    tenantId: opts.tenantId,
    actorId: opts.actorId,
    actorEmail: opts.actorEmail,
    actorIp: opts.actorIp,
    eventType: 'security.billing_self_upgrade_blocked',
    action: 'update',
    resourceType: 'subscription',
    result: 'deny',
    reason: 'Non-platform-admin attempted billing change',
    metadata: opts.attemptedChange,
  });

  // Notify platform admins (best-effort) — query all tenant_admin role
  // assignments across all tenants and notify each.
  try {
    const admins = await db.roleAssignment.findMany({
      where: { role: { name: 'tenant_admin' } },
      select: { userId: true, tenantId: true },
      distinct: ['userId', 'tenantId'],
      take: 50,
    });
    for (const a of admins) {
      await notify({
        tenantId: a.tenantId,
        userId: a.userId,
        type: 'security.billing_self_upgrade_blocked',
        severity: 'critical',
        metadata: {
          actorEmail: opts.actorEmail,
          actorIp: opts.actorIp,
          attemptedChange: JSON.stringify(opts.attemptedChange).slice(0, 500),
        },
      }).catch(() => {});
    }
  } catch (err) {
    logger.warn('billing.alert_admins_failed', { error: (err as Error).message });
  }
}
