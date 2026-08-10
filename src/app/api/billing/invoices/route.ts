/**
 * Smart EDMS — Invoice history
 * GET /api/billing/invoices
 *
 * Returns all payment invoices for the current tenant, paginated.
 * Used by the billing dashboard to show invoice history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    rateLimit: { max: 30, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx) => {
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '50', 10) || 50));

    const [items, total] = await Promise.all([
      db.paymentInvoice.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          provider: true,
          plan: true,
          billingCycle: true,
          amountUsd: true,
          amountDueCrypto: true,
          cryptoCurrency: true,
          status: true,
          invoiceUrl: true,
          createdAt: true,
          confirmedAt: true,
          expiresAt: true,
        },
      }),
      db.paymentInvoice.count({ where: { tenantId: ctx.tenantId } }),
    ]);

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  },
);
