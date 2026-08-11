/**
 * Smart EDMS — Stripe Checkout Session creation
 * POST /api/billing/stripe-checkout
 *
 * Creates a Stripe Checkout Session for card payments. The client redirects
 * to Stripe's hosted checkout page, pays, and Stripe sends a webhook to
 * /api/billing/webhook which activates the subscription.
 *
 * SECURITY (Zero Client Trust):
 *   The client sends { plan, billingCycle, idempotencyKey }. The server
 *   reads the price from PLAN_PRICES_USD and creates the Stripe session
 *   with the correct amount. The client cannot tamper with the price.
 *
 * SECURITY (Webhook-Only Business Logic):
 *   Subscription activation happens ONLY in the Stripe webhook handler.
 *   The success_url is just a display redirect — no business logic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { computePriceUsd, validatePlanLimits, PLAN_LIMITS, type Plan, type BillingCycle } from '@/lib/billing/billing-policy';
import { createInvoiceRecord } from '@/lib/billing/payment-service';
import { isStripeConfigured } from '@/lib/billing/billing-policy';
import { db } from '@/lib/db';
import { z } from 'zod';

const checkoutSchema = z.object({
  plan: z.enum(['starter', 'business', 'enterprise']),
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
  idempotencyKey: z.string().min(16).max(100),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'payment.stripe_checkout', action: 'create', resourceType: 'payment-invoice', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    if (!isStripeConfigured()) {
      throw ApiError.badRequest('stripe_not_configured', 'Stripe is not configured. Set STRIPE_SECRET_KEY.');
    }

    const body = checkoutSchema.parse(await req.json());
    const plan = body.plan as Plan;
    const cycle = body.billingCycle as BillingCycle;
    const priceUsd = computePriceUsd(plan, cycle);

    if (priceUsd <= 0) {
      throw ApiError.badRequest('invalid_plan', 'Selected plan is free — no checkout required');
    }

    // Validate plan limits (defense-in-depth)
    const limits = PLAN_LIMITS[plan];
    const limitsCheck = validatePlanLimits(plan, limits.maxSeats, limits.maxStorageBytes);
    if (!limitsCheck.ok) {
      throw ApiError.badRequest('plan_limit_exceeded', limitsCheck.error!);
    }

    // Create PaymentInvoice record (idempotent)
    const invoice = await createInvoiceRecord({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      provider: 'stripe',
      plan,
      billingCycle: cycle,
      seats: limits.maxSeats,
      storageBytes: limits.maxStorageBytes,
      amountUsd: priceUsd,
      idempotencyKey: body.idempotencyKey,
    });

    // If invoice already has a providerInvoiceId, return existing session
    if (invoice.providerInvoiceId && invoice.invoiceUrl) {
      return NextResponse.json({
        invoiceId: invoice.id,
        checkoutUrl: invoice.invoiceUrl,
        idempotent: true,
      });
    }

    // Create Stripe Checkout Session
    // We use the Stripe API directly (no SDK needed for session creation)
    const stripeKey = process.env.STRIPE_SECRET_KEY!;
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    // Map plan + cycle to Stripe price ID
    const priceIdMap: Record<string, string> = {
      'starter_monthly': process.env.STRIPE_PRICE_STARTER || '',
      'starter_annual': process.env.STRIPE_PRICE_STARTER || '', // annual uses same price with different mode
      'business_monthly': process.env.STRIPE_PRICE_BUSINESS || '',
      'business_annual': process.env.STRIPE_PRICE_BUSINESS || '',
      'enterprise_monthly': process.env.STRIPE_PRICE_ENTERPRISE || '',
      'enterprise_annual': process.env.STRIPE_PRICE_ENTERPRISE || '',
    };
    const priceId = priceIdMap[`${plan}_${cycle}`];

    if (!priceId) {
      throw ApiError.badRequest('stripe_price_not_configured', `Stripe price ID for ${plan} ${cycle} is not configured. Set STRIPE_PRICE_${plan.toUpperCase()}.`);
    }

    // Create the Checkout Session via Stripe API
    const params = new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': `${baseUrl}/api/billing/return?invoice_id=${invoice.id}`,
      'cancel_url': `${baseUrl}/api/billing/return?invoice_id=${invoice.id}&canceled=1`,
      'client_reference_id': invoice.id,
      'metadata[invoice_id]': invoice.id,
      'metadata[plan]': plan,
      'metadata[billing_cycle]': cycle,
      'metadata[tenant_id]': ctx.tenantId,
      'metadata[amount_usd]': String(priceUsd),
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!stripeRes.ok) {
      const errBody = await stripeRes.text().catch(() => '');
      console.error('[stripe] checkout session creation failed:', stripeRes.status, errBody.slice(0, 500));
      throw ApiError.badRequest('stripe_error', `Stripe Checkout Session creation failed: HTTP ${stripeRes.status}`);
    }

    const session = await stripeRes.json();

    // Update the invoice with the Stripe session ID + URL
    await db.paymentInvoice.updateMany({
      where: { id: invoice.id, status: 'pending' },
      data: {
        providerInvoiceId: session.id,
        invoiceUrl: session.url,
        status: 'waiting',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h for Stripe
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'payment.stripe_checkout_created',
      action: 'update',
      resourceType: 'payment-invoice',
      resourceId: invoice.id,
      result: 'allow',
      metadata: {
        provider: 'stripe',
        providerInvoiceId: session.id,
        plan,
        billingCycle: cycle,
        amountUsd: priceUsd,
      },
    });

    return NextResponse.json({
      invoiceId: invoice.id,
      checkoutUrl: session.url,
      idempotent: false,
    });
  },
);
