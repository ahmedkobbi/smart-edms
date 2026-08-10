/**
 * Smart EDMS — Checkout (create payment invoice)
 * POST /api/billing/checkout
 *
 * SECURITY (ZERO CLIENT TRUST):
 *   The client sends { plan, billingCycle, payCurrency, idempotencyKey }.
 *   The server reads the price from PLAN_PRICES_USD (server-side table)
 *   and creates the invoice. The client NEVER sends a price — it cannot
 *   tamper with the amount charged.
 *
 * SECURITY (IDEMPOTENCY):
 *   The client sends an idempotencyKey (UUID). If the same key is reused
 *   (network retry), the server returns the existing invoice instead of
 *   creating a new one. The UNIQUE constraint on idempotencyKey is
 *   enforced at the DB layer — race-safe.
 *
 * The route creates a PaymentInvoice record + a NowPayments invoice, then
 * returns the invoice URL (the client redirects the browser there to pay).
 * The actual subscription activation happens ONLY in the webhook handler
 * — never on the return URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import {
  PLAN_LIMITS,
  PLAN_PRICES_USD,
  computePriceUsd,
  validatePlanLimits,
  isCryptoCurrencyAllowed,
  type Plan,
  type BillingCycle,
} from '@/lib/billing/billing-policy';
import { createInvoiceRecord } from '@/lib/billing/payment-service';
import {
  createNowPaymentsInvoice,
  isNowPaymentsConfigured,
} from '@/lib/billing/nowpayments';
import { db } from '@/lib/db';
import { z } from 'zod';

const checkoutSchema = z.object({
  plan: z.enum(['starter', 'business', 'enterprise']), // trial is free — no checkout
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
  payCurrency: z.string().min(2).max(20), // e.g. 'btc', 'usdttrc20'
  idempotencyKey: z.string().min(16).max(100), // client-supplied UUID
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'payment.checkout', action: 'create', resourceType: 'payment-invoice', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = checkoutSchema.parse(await req.json());

    // --- ZERO CLIENT TRUST: validate plan + compute price server-side ---
    if (!isCryptoCurrencyAllowed(body.payCurrency)) {
      throw ApiError.badRequest('invalid_currency', `Crypto currency ${body.payCurrency} is not supported`);
    }

    const plan = body.plan as Plan;
    const cycle = body.billingCycle as BillingCycle;
    const priceUsd = computePriceUsd(plan, cycle);
    if (priceUsd <= 0) {
      throw ApiError.badRequest('invalid_plan', 'Selected plan is free — no checkout required');
    }

    // Get seats + storage from the plan limits (server-side)
    const limits = PLAN_LIMITS[plan];
    const seats = limits.maxSeats;
    const storageBytes = limits.maxStorageBytes;

    // Validate (defense-in-depth)
    const limitsCheck = validatePlanLimits(plan, seats, storageBytes);
    if (!limitsCheck.ok) {
      throw ApiError.badRequest('plan_limit_exceeded', limitsCheck.error!);
    }

    // --- IDEMPOTENCY: create or fetch the invoice record ---
    const invoice = await createInvoiceRecord({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      provider: 'nowpayments',
      plan,
      billingCycle: cycle,
      seats,
      storageBytes,
      amountUsd: priceUsd,
      payCurrency: body.payCurrency,
      idempotencyKey: body.idempotencyKey,
    });

    // If the invoice already has a providerInvoiceId, it was already
    // sent to NowPayments — return the existing URL (idempotent).
    if (invoice.providerInvoiceId && invoice.invoiceUrl) {
      return NextResponse.json({
        invoiceId: invoice.id,
        invoiceUrl: invoice.invoiceUrl,
        status: invoice.status,
        amountUsd: invoice.amountUsd,
        payCurrency: invoice.payCurrency,
        idempotent: true,
      });
    }

    // --- Create the NowPayments invoice ---
    if (!isNowPaymentsConfigured()) {
      throw ApiError.badRequest('nowpayments_not_configured', 'NowPayments is not configured. Set NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET.');
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    });

    const created = await createNowPaymentsInvoice({
      priceAmount: priceUsd,
      priceCurrency: 'usd',
      orderId: invoice.id,
      orderDescription: `${tenant?.name || 'Smart EDMS'} — ${plan} (${cycle}) — ${seats} seats`,
      payCurrency: body.payCurrency,
      ipnCallbackUrl: `${baseUrl}/api/billing/webhook/nowpayments`,
      successUrl: `${baseUrl}/api/billing/return?invoice_id=${invoice.id}`,
      cancelUrl: `${baseUrl}/api/billing/return?invoice_id=${invoice.id}&canceled=1`,
    });

    // --- Update the invoice with the NowPayments invoice ID + URL ---
    // SECURITY: use updateMany WHERE status='pending' so we don't
    // overwrite an invoice that was already transitioned by a webhook
    // (extremely unlikely at this point, but race-safe).
    const updateResult = await db.paymentInvoice.updateMany({
      where: { id: invoice.id, status: 'pending' },
      data: {
        providerInvoiceId: created.id,
        invoiceUrl: created.invoiceUrl,
        amountDueCrypto: created.amountDueCrypto || null,
        cryptoCurrency: created.payCurrency,
        status: 'waiting',
        expiresAt: created.expiresAt ? new Date(created.expiresAt) : new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    if (updateResult.count === 0) {
      // A webhook already transitioned the invoice between our create
      // and this update. Fetch the current state.
      const current = await db.paymentInvoice.findUnique({ where: { id: invoice.id } });
      return NextResponse.json({
        invoiceId: invoice.id,
        invoiceUrl: current?.invoiceUrl || created.invoiceUrl,
        status: current?.status || 'waiting',
        amountUsd: invoice.amountUsd,
        payCurrency: body.payCurrency,
        idempotent: false,
      });
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      eventType: 'payment.invoice.sent_to_provider',
      action: 'update',
      resourceType: 'payment-invoice',
      resourceId: invoice.id,
      result: 'allow',
      metadata: {
        provider: 'nowpayments',
        providerInvoiceId: created.id,
        amountUsd: priceUsd,
        payCurrency: body.payCurrency,
        amountDueCrypto: created.amountDueCrypto,
      },
    });

    return NextResponse.json({
      invoiceId: invoice.id,
      invoiceUrl: created.invoiceUrl,
      status: 'waiting',
      amountUsd: priceUsd,
      payCurrency: body.payCurrency,
      amountDueCrypto: created.amountDueCrypto,
      expiresAt: created.expiresAt,
      idempotent: false,
    });
  },
);
