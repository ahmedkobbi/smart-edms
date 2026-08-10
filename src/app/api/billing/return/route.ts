/**
 * Smart EDMS — Payment return URL (DISPLAY ONLY)
 * GET /api/billing/return?invoice_id=xxx
 *
 * SECURITY (WEBHOOK-ONLY BUSINESS LOGIC):
 *   This endpoint is the redirect target after the user pays on the
 *   NowPayments-hosted invoice page. It is DISPLAY ONLY — it fetches
 *   the invoice status from the DB (written by the webhook handler) and
 *   redirects the user to the billing dashboard. It NEVER mutates the
 *   subscription, NEVER transitions the invoice status, and NEVER trusts
 *   query params other than `invoice_id`.
 *
 *   This prevents return-URL tampering attacks (e.g. an attacker crafting
 *   `/api/billing/return?invoice_id=xxx&status=confirmed` to activate a
 *   subscription without paying). The only thing this endpoint does is
 *   read the invoice by ID and redirect.
 *
 * The subscription activation happens ONLY in the webhook handler at
 * POST /api/billing/webhook/nowpayments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';

export async function GET(req: NextRequest) {
  const invoiceId = req.nextUrl.searchParams.get('invoice_id');
  const canceled = req.nextUrl.searchParams.get('canceled') === '1';

  if (!invoiceId) {
    return NextResponse.redirect(new URL('/admin/billing?error=missing_invoice', process.env.NEXTAUTH_URL || 'http://localhost:3000'));
  }

  // Fetch the invoice from the DB — the status here was written by the
  // webhook handler, NOT by this endpoint. This is read-only.
  const invoice = await db.paymentInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, plan: true, amountUsd: true, provider: true },
  });

  if (!invoice) {
    logger.warn('billing.return_invoice_not_found', { invoiceId });
    return NextResponse.redirect(new URL('/admin/billing?error=invoice_not_found', process.env.NEXTAUTH_URL || 'http://localhost:3000'));
  }

  // Redirect to the billing dashboard with the invoice status as a query
  // param (for the UI to show a success/pending/canceled message).
  const redirectUrl = new URL('/admin/billing', process.env.NEXTAUTH_URL || 'http://localhost:3000');
  redirectUrl.searchParams.set('invoice_id', invoiceId);
  redirectUrl.searchParams.set('status', canceled ? 'canceled' : invoice.status);

  logger.info('billing.return_redirect', {
    invoiceId,
    status: invoice.status,
    canceled,
  });

  return NextResponse.redirect(redirectUrl);
}
