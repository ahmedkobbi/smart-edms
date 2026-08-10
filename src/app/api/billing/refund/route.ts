/**
 * Smart EDMS — Refund a payment
 * POST /api/billing/refund   { invoiceId, reason }
 *
 * SECURITY (REFUND SAFETY):
 *   Refunds require:
 *     1. Platform admin permission (ADMIN_PLATFORM_BILLING_MANAGE) —
 *        tenant_admins cannot refund
 *     2. Step-up auth (MFA or password re-entry)
 *     3. The invoice must be in `confirmed` status (the only state that
 *        can transition to `refunded`)
 *
 *   Refunds are NEVER automatic — no cron job, no webhook, no UI button
 *   for tenant_admins. Only a platform admin can issue a refund, and
 *   every refund is audit-logged with the actor + reason.
 *
 *   The actual refund at the payment provider (NowPayments / Stripe) is
 *   initiated separately via the provider's dashboard — this endpoint
 *   only records the refund in our DB and downgrades the subscription
 *   to `past_due`. The platform admin must issue the refund at the
 *   provider manually and then call this endpoint to record it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { transitionInvoiceStatus } from '@/lib/billing/payment-service';
import { db } from '@/lib/db';
import { z } from 'zod';

const refundSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().min(10).max(1000),
  providerRefundId: z.string().optional(), // ID from the provider's dashboard
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true, // REFUND SAFETY: step-up auth required
    rateLimit: { max: 5, windowMs: 60_000 },
    audit: { eventType: 'payment.refund', action: 'update', resourceType: 'payment-invoice', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    // REFUND SAFETY: only platform admins can refund
    if (!hasPermission(ctx.session.user.permissions, PERMISSIONS.ADMIN_PLATFORM_BILLING_MANAGE)) {
      throw ApiError.forbidden(
        'not_authorized_refund',
        'Refunds require platform admin permission. Issue the refund at the provider dashboard first, then contact a platform admin to record it.',
      );
    }

    const body = refundSchema.parse(await req.json());

    const invoice = await db.paymentInvoice.findFirst({
      where: { id: body.invoiceId, tenantId: ctx.tenantId },
    });
    if (!invoice) {
      throw ApiError.notFound('invoice_not_found', 'Invoice not found');
    }

    if (invoice.status !== 'confirmed') {
      throw ApiError.badRequest(
        'not_refundable',
        `Invoice status is ${invoice.status} — only 'confirmed' invoices can be refunded`,
      );
    }

    // Record who issued the refund (for the audit trail)
    await db.paymentInvoice.update({
      where: { id: invoice.id },
      data: { refundedBy: ctx.userId },
    });

    // Transition to `refunded` — this also triggers the subscription
    // downgrade to `past_due` via handleRefundSubscriptionDowngrade()
    const result = await transitionInvoiceStatus(
      invoice.id,
      'refunded',
      `refund:${ctx.userId}:${Date.now()}`,
    );

    if (!result.ok) {
      throw ApiError.badRequest('refund_failed', result.reason || 'Refund transition failed');
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'payment.refunded',
      action: 'update',
      resourceType: 'payment-invoice',
      resourceId: invoice.id,
      result: 'allow',
      reason: body.reason,
      metadata: {
        invoiceId: invoice.id,
        amountUsd: invoice.amountUsd,
        plan: invoice.plan,
        providerRefundId: body.providerRefundId,
      },
    });

    return NextResponse.json({ ok: true, invoiceId: invoice.id, status: 'refunded' });
  },
);
