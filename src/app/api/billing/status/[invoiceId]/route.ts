/**
 * Smart EDMS — Payment status polling
 * GET /api/billing/status/:invoiceId
 *
 * Returns the current status of a payment invoice. Used by the client UI
 * to poll for status changes after the user returns from the NowPayments
 * invoice page.
 *
 * SECURITY:
 *   - Read-only — never mutates the invoice or subscription
 *   - Tenant-scoped — the invoice must belong to the caller's tenant
 *   - The status here was written by the webhook handler, NOT by this
 *     endpoint. This endpoint is a pure read.
 *
 * The client polls this every 3-5 seconds after the user returns from
 * NowPayments. When the status reaches `confirmed`, the UI shows a success
 * message and refreshes the subscription data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    rateLimit: { max: 60, windowMs: 60_000 }, // 1/sec — for polling
  },
  async (req: NextRequest, ctx, params) => {
    const invoice = await db.paymentInvoice.findFirst({
      where: {
        id: params!.invoiceId,
        tenantId: ctx.tenantId, // tenant-scoped
      },
      select: {
        id: true,
        status: true,
        plan: true,
        billingCycle: true,
        seats: true,
        amountUsd: true,
        amountDueCrypto: true,
        amountReceivedCrypto: true,
        cryptoCurrency: true,
        payCurrency: true,
        invoiceUrl: true,
        expiresAt: true,
        confirmedAt: true,
        createdAt: true,
        provider: true,
      },
    });

    if (!invoice) {
      throw ApiError.notFound('invoice_not_found', 'Invoice not found');
    }

    return NextResponse.json({ invoice });
  },
);
