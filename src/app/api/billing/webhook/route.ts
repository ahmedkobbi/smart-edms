/**
 * Smart EDMS — Stripe webhook
 * POST /api/billing/webhook
 *
 * SECURITY FIX (L-ADM-6): Receives Stripe events and applies them to the
 * local Subscription table. This is the ONLY way plan/seats/storage can
 * change in 'stripe' billing mode — the PATCH /api/admin/billing endpoint
 * rejects all non-platform-admin changes.
 *
 * The webhook:
 *   1. Reads the raw body (NOT parsed JSON — Stripe signs the raw bytes)
 *   2. Verifies the Stripe-Signature header using STRIPE_WEBHOOK_SECRET
 *      with a 5-minute replay-protection window
 *   3. Handles `customer.subscription.*` events:
 *      - Maps Stripe price IDs to local plan names
 *      - Maps Stripe quantity to seats
 *      - Maps Stripe metadata.storageBytes to storageBytes
 *      - Calls applyStripeSubscriptionUpdate() which updates the DB +
 *        records an audit event with actorId='stripe'
 *   4. Returns 200 quickly (Stripe expects <30s response) — heavy work
 *      is synchronous here for simplicity; for high volume, enqueue a
 *      background job instead.
 *
 * The endpoint is unauthenticated (Stripe doesn't have our session cookie)
 * but the signature verification is the auth gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeWebhookSignature, applyStripeSubscriptionUpdate, type Plan } from '@/lib/billing/billing-policy';
import { logger } from '@/lib/config/logger';

/**
 * Map a Stripe price ID to a local plan name.
 *
 * In production, this mapping is configured via env vars:
 *   STRIPE_PRICE_TRIAL=price_xxx
 *   STRIPE_PRICE_STARTER=price_yyy
 *   STRIPE_PRICE_BUSINESS=price_zzz
 *   STRIPE_PRICE_ENTERPRISE=price_www
 *
 * Falls back to metadata.plan on the subscription if the price ID is not
 * recognized.
 */
function mapStripePriceToPlan(priceId: string, metadata?: Record<string, string>): Plan {
  const priceMap: Record<string, Plan> = {
    [process.env.STRIPE_PRICE_TRIAL || 'price_trial_dummy']: 'trial',
    [process.env.STRIPE_PRICE_STARTER || 'price_starter_dummy']: 'starter',
    [process.env.STRIPE_PRICE_BUSINESS || 'price_business_dummy']: 'business',
    [process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise_dummy']: 'enterprise',
  };
  return priceMap[priceId] || (metadata?.plan as Plan) || 'trial';
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('billing.webhook_no_secret', {});
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  // Read the RAW body — Stripe signs the raw bytes, not the parsed JSON.
  // Using req.text() preserves the exact byte sequence Stripe signed.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('stripe-signature') || '';

  // Verify the signature (HMAC-SHA256 + 5-min replay window)
  const sigCheck = await verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
  if (!sigCheck.valid) {
    logger.warn('billing.webhook_signature_failed', { reason: sigCheck.reason });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the event
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  logger.info('billing.webhook_received', { type: event.type, id: event.id });

  // Handle subscription events
  if (event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted') {
    const sub = event.data?.object;
    if (!sub) {
      return NextResponse.json({ error: 'Missing subscription object' }, { status: 400 });
    }

    // Map Stripe fields to local fields
    const priceId = sub.items?.data?.[0]?.price?.id || '';
    const quantity = sub.items?.data?.[0]?.quantity || 1;
    const metadata = sub.metadata || {};
    const plan = mapStripePriceToPlan(priceId, metadata);
    const seats = parseInt(metadata.seats || String(quantity), 10) || 1;
    const storageBytes = parseInt(metadata.storageBytes || '0', 10) || 0;

    // If storageBytes is not in metadata, fall back to plan default
    const finalStorageBytes = storageBytes > 0
      ? storageBytes
      : (plan === 'trial' ? 5 * 1024 * 1024 * 1024
         : plan === 'starter' ? 50 * 1024 * 1024 * 1024
         : plan === 'business' ? 500 * 1024 * 1024 * 1024
         : 10 * 1024 * 1024 * 1024 * 1024);

    // Map Stripe status to local status
    const statusMap: Record<string, 'active' | 'past_due' | 'canceled' | 'trialing'> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'canceled',
      trialing: 'trialing',
      incomplete: 'past_due',
      incomplete_expired: 'canceled',
      unpaid: 'past_due',
    };
    const localStatus = statusMap[sub.status] || 'active';

    try {
      await applyStripeSubscriptionUpdate({
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan,
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : localStatus,
        seats,
        storageBytes: finalStorageBytes,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      });
    } catch (err) {
      logger.error('billing.webhook_apply_failed', {
        error: (err as Error).message,
        stripeSubscriptionId: sub.id,
      });
      // Return 500 so Stripe retries
      return NextResponse.json({ error: 'Failed to apply update' }, { status: 500 });
    }
  } else {
    // Unhandled event type — log + return 200 (Stripe expects 200 for received events)
    logger.debug('billing.webhook_unhandled_event', { type: event.type });
  }

  // Always return 200 quickly — Stripe expects a response within 30s
  return NextResponse.json({ received: true });
}
