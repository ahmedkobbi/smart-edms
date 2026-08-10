/**
 * Smart EDMS — Payment service
 *
 * Shared business logic for payment processing — used by both the
 * NowPayments webhook and the Stripe webhook. Centralizes:
 *
 *   1. Idempotent invoice creation (DB unique constraint on idempotencyKey)
 *   2. Atomic status transitions (updateMany WHERE status IN allowed_prev)
 *   3. Webhook event dedup (processedWebhooks JSON array)
 *   4. Subscription activation on `confirmed` (the ONLY place subscriptions
 *      are activated from a payment)
 *   5. Audit trail (every transition recorded)
 *
 * SECURITY: this module is the single source of truth for payment-driven
 * subscription changes. The webhook handlers are thin — they verify the
 * signature, parse the event, and call `transitionInvoiceStatus()`. All
 * business logic lives here.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import {
  isStatusTransitionAllowed,
  isTerminalStatus,
  computeBillingPeriod,
  validatePlanLimits,
  type Plan,
  type BillingCycle,
  type InvoiceStatus,
} from './billing-policy';

// ---------------------------------------------------------------------------
//  Idempotent invoice creation
// ---------------------------------------------------------------------------

export interface CreateInvoiceRecordParams {
  tenantId: string;
  userId: string;
  provider: 'nowpayments' | 'stripe';
  plan: Plan;
  billingCycle: BillingCycle;
  seats: number;
  storageBytes: number;
  amountUsd: number;
  payCurrency?: string;
  idempotencyKey: string;
}

/**
 * Create a PaymentInvoice record with idempotency.
 *
 * If an invoice with the same `idempotencyKey` already exists, return it
 * instead of creating a new one. The UNIQUE constraint on idempotencyKey
 * is enforced at the DB layer — race-safe even under concurrent requests.
 *
 * SECURITY (ZERO CLIENT TRUST): `amountUsd` is computed by the caller from
 * PLAN_PRICES_USD, never from the client request. The client only sends
 * { plan, billingCycle, payCurrency, idempotencyKey }.
 */
export async function createInvoiceRecord(params: CreateInvoiceRecordParams) {
  // Check if an invoice with this idempotency key already exists
  const existing = await db.paymentInvoice.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) {
    logger.info('payment.idempotent_hit', {
      idempotencyKey: params.idempotencyKey,
      invoiceId: existing.id,
      status: existing.status,
    });
    return existing;
  }

  // Validate plan limits (defense-in-depth — the checkout route also checks)
  const limitsCheck = validatePlanLimits(params.plan, params.seats, params.storageBytes);
  if (!limitsCheck.ok) {
    throw new Error(`Plan limit exceeded: ${limitsCheck.error}`);
  }

  // Create the invoice. The UNIQUE constraint on idempotencyKey protects
  // against the race where two concurrent requests with the same key both
  // pass the `findUnique` check — the second `create` throws P2002, which
  // we catch and re-query.
  try {
    const invoice = await db.paymentInvoice.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        provider: params.provider,
        plan: params.plan,
        billingCycle: params.billingCycle,
        seats: params.seats,
        storageBytes: BigInt(params.storageBytes),
        amountUsd: params.amountUsd,
        payCurrency: params.payCurrency || null,
        idempotencyKey: params.idempotencyKey,
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min default
      },
    });

    await recordAuditEvent({
      tenantId: params.tenantId,
      actorId: params.userId,
      eventType: 'payment.invoice.created',
      action: 'create',
      resourceType: 'payment-invoice',
      resourceId: invoice.id,
      result: 'allow',
      metadata: {
        provider: params.provider,
        plan: params.plan,
        billingCycle: params.billingCycle,
        amountUsd: params.amountUsd,
        seats: params.seats,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return invoice;
  } catch (err: any) {
    // Prisma P2002 = unique constraint violation — the idempotency key
    // was inserted by a concurrent request. Re-query and return it.
    if (err.code === 'P2002') {
      const existing = await db.paymentInvoice.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) {
        logger.info('payment.idempotent_race_resolved', {
          idempotencyKey: params.idempotencyKey,
          invoiceId: existing.id,
        });
        return existing;
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
//  Atomic status transition
// ---------------------------------------------------------------------------

export interface TransitionResult {
  ok: boolean;
  invoice?: any;
  reason?: string;
  alreadyProcessed?: boolean; // webhook event was already processed (dedup)
}

/**
 * Transition an invoice to a new status ATOMICALLY.
 *
 * Uses `updateMany WHERE id = ? AND status IN (allowed_prev_states)` so
 * two concurrent webhooks cannot both transition the invoice. Only one
 * wins (count=1); the other gets count=0 and is treated as a no-op.
 *
 * If the webhook event ID is already in `processedWebhooks`, returns
 * `alreadyProcessed: true` without doing anything — this is the replay
 * protection. NowPayments retries webhooks on 5xx; we must be idempotent.
 *
 * On transition to `confirmed`, the subscription is activated (the ONLY
 * place this happens from a payment).
 *
 * @param invoiceId The PaymentInvoice.id
 * @param toStatus The target status
 * @param webhookEventId A unique ID for this webhook delivery (for dedup).
 *                       NowPayments doesn't send a delivery ID, so we
 *                       synthesize one from `${payment_id}:${status}`.
 * @param metadata Extra fields to update (e.g. amountReceivedCrypto)
 */
export async function transitionInvoiceStatus(
  invoiceId: string,
  toStatus: InvoiceStatus,
  webhookEventId: string,
  metadata?: {
    providerInvoiceId?: string;
    providerPaymentId?: string;
    amountDueCrypto?: number;
    amountReceivedCrypto?: number;
    cryptoCurrency?: string;
  },
): Promise<TransitionResult> {
  const invoice = await db.paymentInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    return { ok: false, reason: 'Invoice not found' };
  }

  // --- Replay protection: check if this webhook event was already processed ---
  const processed: string[] = JSON.parse(invoice.processedWebhooks || '[]');
  if (processed.includes(webhookEventId)) {
    logger.info('payment.webhook_already_processed', {
      invoiceId,
      webhookEventId,
      currentStatus: invoice.status,
    });
    return { ok: true, alreadyProcessed: true, invoice };
  }

  // --- Status machine check ---
  const fromStatus = invoice.status as InvoiceStatus;
  if (fromStatus === toStatus) {
    // Same status — record the event as processed and return
    await markWebhookProcessed(invoiceId, webhookEventId, processed);
    return { ok: true, alreadyProcessed: true, invoice };
  }
  if (!isStatusTransitionAllowed(fromStatus, toStatus)) {
    logger.warn('payment.invalid_status_transition', {
      invoiceId,
      from: fromStatus,
      to: toStatus,
    });
    return { ok: false, reason: `Cannot transition from ${fromStatus} to ${toStatus}` };
  }

  // --- Atomic transition via updateMany ---
  // Only succeeds if the current status is still `fromStatus` (i.e. no
  // concurrent webhook beat us to it). count=0 means we lost the race —
  // treat as already processed.
  const updateData: any = {
    status: toStatus,
    updatedAt: new Date(),
    ...(metadata?.providerInvoiceId ? { providerInvoiceId: metadata.providerInvoiceId } : {}),
    ...(metadata?.providerPaymentId ? { providerPaymentId: metadata.providerPaymentId } : {}),
    ...(metadata?.amountDueCrypto !== undefined ? { amountDueCrypto: metadata.amountDueCrypto } : {}),
    ...(metadata?.amountReceivedCrypto !== undefined ? { amountReceivedCrypto: metadata.amountReceivedCrypto } : {}),
    ...(metadata?.cryptoCurrency ? { cryptoCurrency: metadata.cryptoCurrency } : {}),
  };
  if (toStatus === 'confirmed') {
    updateData.confirmedAt = new Date();
  }
  if (toStatus === 'refunded') {
    updateData.refundedAt = new Date();
  }

  const result = await db.paymentInvoice.updateMany({
    where: { id: invoiceId, status: fromStatus },
    data: updateData,
  });

  if (result.count === 0) {
    // Lost the race — another webhook already transitioned. Record our
    // event as processed and return.
    await markWebhookProcessed(invoiceId, webhookEventId, processed);
    return { ok: true, alreadyProcessed: true, invoice };
  }

  // Re-fetch the updated invoice
  const updated = await db.paymentInvoice.findUnique({ where: { id: invoiceId } });
  await markWebhookProcessed(invoiceId, webhookEventId, processed);

  // --- Audit trail ---
  await recordAuditEvent({
    tenantId: invoice.tenantId,
    actorId: 'webhook',
    actorEmail: `${invoice.provider}@webhook`,
    eventType: `payment.status.${toStatus}`,
    action: 'update',
    resourceType: 'payment-invoice',
    resourceId: invoiceId,
    result: 'allow',
    metadata: {
      from: fromStatus,
      to: toStatus,
      webhookEventId,
      provider: invoice.provider,
      plan: invoice.plan,
      amountUsd: invoice.amountUsd,
      amountReceivedCrypto: metadata?.amountReceivedCrypto,
    },
  });

  // --- On `confirmed`, activate the subscription ---
  if (toStatus === 'confirmed') {
    await activateSubscriptionFromInvoice(updated!);
  }

  // --- On `refunded`, downgrade the subscription (safely) ---
  if (toStatus === 'refunded') {
    await handleRefundSubscriptionDowngrade(updated!);
  }

  return { ok: true, invoice: updated };
}

/**
 * Mark a webhook event as processed (append to processedWebhooks JSON array).
 */
async function markWebhookProcessed(invoiceId: string, webhookEventId: string, currentList: string[]): Promise<void> {
  const updated = [...currentList, webhookEventId].slice(-100); // cap at 100 entries
  await db.paymentInvoice.update({
    where: { id: invoiceId },
    data: { processedWebhooks: JSON.stringify(updated) },
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
//  Subscription activation (ONLY called from transitionInvoiceStatus on 'confirmed')
// ---------------------------------------------------------------------------

/**
 * Activate the subscription based on a confirmed invoice.
 *
 * This is the ONLY function that activates a subscription from a payment.
 * The /api/billing/return endpoint never calls this — only the webhook
 * handler does (via transitionInvoiceStatus).
 *
 * SECURITY: the plan/seats/storage come from the PaymentInvoice row (which
 * was written server-side at checkout time), NOT from the webhook payload.
 * The webhook only confirms that payment was received — it cannot change
 * what was purchased.
 */
async function activateSubscriptionFromInvoice(invoice: any): Promise<void> {
  const plan = invoice.plan as Plan;
  const cycle = invoice.billingCycle as BillingCycle;
  const period = computeBillingPeriod(cycle);

  // Upsert the subscription with the new plan
  const sub = await db.subscription.upsert({
    where: { tenantId: invoice.tenantId },
    update: {
      plan,
      status: 'active',
      seats: invoice.seats,
      storageBytes: invoice.storageBytes,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      // Link the Stripe IDs if this was a Stripe payment
      ...(invoice.provider === 'stripe' && invoice.providerInvoiceId ? {
        stripeSubscriptionId: invoice.providerInvoiceId,
      } : {}),
    },
    create: {
      tenantId: invoice.tenantId,
      plan,
      status: 'active',
      seats: invoice.seats,
      storageBytes: invoice.storageBytes,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    },
  });

  await recordAuditEvent({
    tenantId: invoice.tenantId,
    actorId: 'webhook',
    actorEmail: `${invoice.provider}@webhook`,
    eventType: 'billing.subscription.activated',
    action: 'update',
    resourceType: 'subscription',
    resourceId: sub.id,
    result: 'allow',
    metadata: {
      invoiceId: invoice.id,
      plan,
      billingCycle: cycle,
      seats: invoice.seats,
      amountUsd: invoice.amountUsd,
      periodEnd: period.end.toISOString(),
    },
  });

  logger.info('payment.subscription_activated', {
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    plan,
    cycle,
  });
}

/**
 * Handle subscription downgrade after a refund.
 *
 * When a payment is refunded, the subscription should be downgraded. We
 * don't automatically cancel (the tenant admin may want to keep the data
 * and re-subscribe) — we set the status to `past_due` and let the admin
 * decide. The seats/storage are NOT changed (to avoid locking users out
 * mid-session); the admin can manually downgrade via PATCH /api/admin/billing.
 */
async function handleRefundSubscriptionDowngrade(invoice: any): Promise<void> {
  await db.subscription.updateMany({
    where: { tenantId: invoice.tenantId },
    data: { status: 'past_due' },
  });

  await recordAuditEvent({
    tenantId: invoice.tenantId,
    actorId: 'system',
    eventType: 'billing.subscription.past_due_after_refund',
    action: 'update',
    resourceType: 'subscription',
    result: 'allow',
    metadata: { invoiceId: invoice.id, refundedBy: invoice.refundedBy },
  });
}

// ---------------------------------------------------------------------------
//  Invoice expiry (called by cron)
// ---------------------------------------------------------------------------

/**
 * Mark all pending/waiting/confirming invoices past their expiry as expired.
 * Returns the count of expired invoices.
 *
 * SECURITY: this prevents an attacker from holding an invoice open
 * indefinitely (e.g. creating many invoices to lock up NowPayments quota).
 */
export async function expireStaleInvoices(): Promise<number> {
  const result = await db.paymentInvoice.updateMany({
    where: {
      status: { in: ['pending', 'waiting', 'confirming'] },
      expiresAt: { lt: new Date() },
    },
    data: { status: 'expired', updatedAt: new Date() },
  });

  if (result.count > 0) {
    logger.info('payment.expired_invoices', { count: result.count });
  }

  return result.count;
}
