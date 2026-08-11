/**
 * Smart EDMS — NowPayments webhook (IPN — Instant Payment Notification)
 * POST /api/billing/webhook/nowpayments
 *
 * SECURITY — strict payment security rules:
 *
 *   1. WEBHOOK SIGNATURE VERIFICATION: every IPN is signed with HMAC-SHA256
 *      over the alphabetically-sorted, `|`-concatenated values of the JSON
 *      body. The signature is in the `x-nowpayments-sig` header. We verify
 *      it with NOWPAYMENTS_IPN_SECRET. Unsigned or mismatched webhooks are
 *      dropped with 400.
 *
 *   2. IP ALLOWLIST: when NOWPAYMENTS_ALLOWED_IPS is configured, we reject
 *      webhooks from any other IP. This is defense-in-depth — the HMAC is
 *      the primary auth, but the IP check catches the case where the HMAC
 *      secret has leaked but the attacker hasn't yet forged a signature
 *      from a NowPayments IP.
 *
 *   3. REPLAY PROTECTION: each webhook delivery is deduplicated by a
 *      synthesized event ID `${payment_id}:${payment_status}`. The
 *      PaymentInvoice.processedWebhooks field stores every processed
 *      event ID. Duplicate deliveries (NowPayments retries on 5xx) are
 *      a no-op.
 *
 *   4. WEBHOOK-ONLY BUSINESS LOGIC: subscription activation happens HERE
 *      and ONLY here — never on the /api/billing/return endpoint. The
 *      return URL is display-only.
 *
 *   5. ATOMIC STATUS TRANSITIONS: the transition uses updateMany WHERE
 *      status IN (allowed_prev_states) so two concurrent webhooks cannot
 *      both transition the invoice. Only one wins.
 *
 *   6. UNDERPAYMENT PROTECTION: the invoice only transitions to
 *      `confirmed` when `actually_paid >= pay_amount`. Partial payments
 *      stay in `confirming` until the full amount arrives or the invoice
 *      expires.
 *
 *   7. ZERO CLIENT TRUST: the plan/seats/storage come from the
 *      PaymentInvoice row (written server-side at checkout), NOT from the
 *      webhook payload. The webhook only confirms that payment was
 *      received — it cannot change what was purchased.
 *
 * The endpoint always returns 200 quickly (NowPayments expects <30s
 * response) — heavy work is synchronous for correctness.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/config/logger';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import {
  verifyNowPaymentsWebhookSignature,
  isFromNowPaymentsIp,
  mapNowPaymentsStatus,
  type NowPaymentsWebhookEvent,
} from '@/lib/billing/nowpayments';
import { transitionInvoiceStatus } from '@/lib/billing/payment-service';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // --- Read the RAW body (NowPayments signs the raw JSON, but the signature
  // is computed from the sorted values, so we parse + re-serialize for verify) ---
  const rawBody = await req.text();
  if (!rawBody) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  let event: NowPaymentsWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // --- 1. IP allowlist check (defense-in-depth) ---
  if (!isFromNowPaymentsIp(ip)) {
    logger.warn('nowpayments.webhook_ip_blocked', { ip });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- 2. Signature verification ---
  const signatureHeader = req.headers.get('x-nowpayments-sig') || '';
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    logger.error('nowpayments.webhook_no_secret', {});
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  // NowPayments computes the signature over the parsed JSON's sorted values
  // (not the raw body). We pass the parsed body to the verifier.
  if (!verifyNowPaymentsWebhookSignature(event as any, signatureHeader, secret)) {
    logger.warn('nowpayments.webhook_signature_failed', {
      ip,
      paymentId: event.payment_id,
      invoiceId: event.invoice_id,
    });
    // Record the failed attempt for forensics
    await recordAuditEvent({
      tenantId: 'system',
      actorId: 'nowpayments-webhook',
      actorIp: ip,
      eventType: 'payment.webhook_signature_failed',
      action: 'create',
      resourceType: 'payment-invoice',
      result: 'deny',
      metadata: {
        paymentId: event.payment_id,
        invoiceId: event.invoice_id,
        orderId: event.order_id,
      },
    }).catch(() => {});
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  logger.info('nowpayments.webhook_received', {
    ip,
    paymentId: event.payment_id,
    invoiceId: event.invoice_id,
    orderId: event.order_id,
    status: event.payment_status,
  });

  // --- 3. Find the invoice by order_id (our PaymentInvoice.id) ---
  if (!event.order_id) {
    logger.warn('nowpayments.webhook_no_order_id', { paymentId: event.payment_id });
    return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
  }

  const invoice = await db.paymentInvoice.findUnique({
    where: { id: event.order_id },
  });
  if (!invoice) {
    logger.warn('nowpayments.webhook_invoice_not_found', { orderId: event.order_id });
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  // --- 4. Synthesize a dedup event ID ---
  // NowPayments doesn't send a delivery ID, so we synthesize one from
  // the payment_id + status. If the same payment_id transitions to the
  // same status twice (retry), the dedup catches it.
  const webhookEventId = `${event.payment_id}:${event.payment_status}`;

  // --- 5. Map the NowPayments status to our internal status ---
  const targetStatus = mapNowPaymentsStatus(event.payment_status);

  // --- 6. UNDERPAYMENT PROTECTION ---
  // Only transition to `confirmed` if the actually_paid >= pay_amount.
  const payAmount = parseFloat(event.pay_amount) || 0;
  const actuallyPaid = parseFloat(event.actually_paid) || 0;
  if (targetStatus === 'confirmed' && actuallyPaid < payAmount) {
    logger.warn('nowpayments.underpayment', {
      invoiceId: invoice.id,
      payAmount,
      actuallyPaid,
    });
    // Downgrade to `confirming` — the payment is partial
    // The cron reconciliation will catch up if more arrives later
    const result = await transitionInvoiceStatus(
      invoice.id,
      'confirming',
      webhookEventId,
      {
        providerInvoiceId: event.invoice_id,
        providerPaymentId: event.payment_id,
        amountDueCrypto: payAmount,
        amountReceivedCrypto: actuallyPaid,
        cryptoCurrency: event.pay_currency,
      },
    );
    return NextResponse.json({ received: true, result: { status: 'confirming', underpaid: true } });
  }

  // --- 7. Atomic status transition ---
  const result = await transitionInvoiceStatus(
    invoice.id,
    targetStatus,
    webhookEventId,
    {
      providerInvoiceId: event.invoice_id,
      providerPaymentId: event.payment_id,
      amountDueCrypto: payAmount,
      amountReceivedCrypto: actuallyPaid,
      cryptoCurrency: event.pay_currency,
    },
  );

  if (!result.ok) {
    logger.warn('nowpayments.webhook_transition_failed', {
      invoiceId: invoice.id,
      targetStatus,
      reason: result.reason,
    });
    // Return 200 anyway — NowPayments retries on 5xx, and we've recorded
    // the failure in the audit log. A retry won't help if the status
    // machine rejected the transition.
    return NextResponse.json({ received: true, error: result.reason });
  }

  return NextResponse.json({
    received: true,
    status: targetStatus,
    alreadyProcessed: result.alreadyProcessed,
  });
}
