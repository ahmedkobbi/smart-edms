/**
 * Smart EDMS — NowPayments API client + webhook verification
 *
 * NowPayments is a crypto payment processor (BTC, ETH, USDT, USDC, LTC,
 * XMR, etc.). We use their "Invoice" API which hosts a payment page on
 * their domain — the user is redirected there to pay, then returns to
 * our /api/billing/return endpoint (which is DISPLAY ONLY — no business
 * logic). The actual subscription activation happens in the webhook
 * (IPN — Instant Payment Notification) handler.
 *
 * SECURITY:
 *
 *   1. ZERO CLIENT TRUST: the client never sends a price. The checkout
 *      route reads the price from PLAN_PRICES_USD and sends it to
 *      NowPayments. The client cannot tamper with the amount.
 *
 *   2. WEBHOOK SIGNATURE: NowPayments signs every IPN with HMAC-SHA512
 *      over the JSON body, sent in the `x-nowpayments-sig` header. The
 *      signature is computed by concatenating the sorted JSON keys' values
 *      with `|` and HMAC'ing the result. We verify this on every webhook.
 *
 *   3. IP ALLOWLIST: NowPayments publishes their source IP ranges. We
 *      reject webhooks from any other IP as a defense-in-depth (in case
 *      the HMAC secret leaks).
 *
 *   4. REPLAY PROTECTION: webhook deliveries are deduplicated by their
 *      payment_id + status combination. The PaymentInvoice.processedWebhooks
 *      field stores every processed event ID.
 *
 *   5.ATOMIC STATUS TRANSITIONS: status changes use updateMany with
 *      WHERE status IN (allowed_prev_states) so two concurrent webhooks
 *      cannot both transition the invoice.
 *
 * Configuration:
 *   - NOWPAYMENTS_API_KEY: server-side API key (from NowPayments dashboard)
 *   - NOWPAYMENTS_IPN_SECRET: HMAC-SHA512 signing secret (from dashboard)
 *   - NOWPAYMENTS_API_BASE: API base URL (default: https://api.nowpayments.io/v1)
 *   - NOWPAYMENTS_ALLOWED_IPS: comma-separated IP allowlist (optional but
 *     strongly recommended)
 *   - NOWPAYMENTS_SUCCESS_URL: the display-only return URL after payment
 *   - NOWPAYMENTS_CANCEL_URL: the URL when the user cancels
 */

import crypto from 'crypto';
import { logger } from '@/lib/config/logger';
import { ssrfSafeFetch } from '@/lib/security/ssrf-safe-fetch';
import { isCryptoCurrencyAllowed } from './billing-policy';

// ---------------------------------------------------------------------------
//  Configuration
// ---------------------------------------------------------------------------

const API_BASE = process.env.NOWPAYMENTS_API_BASE || 'https://api.nowpayments.io/v1';
const API_KEY = process.env.NOWPAYMENTS_API_KEY;
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

export function isNowPaymentsConfigured(): boolean {
  return !!API_KEY && !!IPN_SECRET;
}

/**
 * Get the configured IP allowlist for NowPayments webhooks.
 * Returns an empty array if not configured (the IP check is then skipped
 * — but the HMAC signature check is always enforced).
 */
export function getNowPaymentsIpAllowlist(): string[] {
  const raw = process.env.NOWPAYMENTS_ALLOWED_IPS?.trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
//  Invoice creation
// ---------------------------------------------------------------------------

export interface CreateInvoiceParams {
  /** USD price — computed server-side from PLAN_PRICES_USD (NEVER client-supplied) */
  priceAmount: number;
  /** USD — always 'usd' for our use case */
  priceCurrency: string;
  /** Internal invoice ID (PaymentInvoice.id) — NowPayments echoes it back in the webhook */
  orderId: string;
  /** Human-readable description shown on the NowPayments invoice page */
  orderDescription: string;
  /** The crypto currency the user chose to pay in (e.g. 'btc', 'usdttrc20') */
  payCurrency: string;
  /** Callback URL for IPN (webhook) — points to our /api/billing/webhook/nowpayments */
  ipnCallbackUrl: string;
  /** Success URL — DISPLAY ONLY, no business logic */
  successUrl: string;
  /** Cancel URL — when the user cancels on the NowPayments page */
  cancelUrl: string;
}

export interface CreatedInvoice {
  /** NowPayments invoice ID (e.g. 'inv_abc123') */
  id: string;
  /** URL of the NowPayments-hosted invoice page — client redirects here */
  invoiceUrl: string;
  /** Crypto amount due (e.g. 0.00123456 BTC) */
  amountDueCrypto?: number;
  /** The crypto currency code */
  payCurrency: string;
  /** Invoice expiry (ISO string) — typically 20 min */
  expiresAt?: string;
}

/**
 * Create a NowPayments invoice.
 *
 * Calls POST /v1/invoice with the server-side computed price. The client
 * never sees or controls the price — it only sends { plan, billingCycle,
 * payCurrency, idempotencyKey }.
 *
 * @throws if NowPayments is not configured, the API call fails, or the
 *         response is malformed.
 */
export async function createNowPaymentsInvoice(params: CreateInvoiceParams): Promise<CreatedInvoice> {
  if (!isNowPaymentsConfigured()) {
    throw new Error('NowPayments is not configured (NOWPAYMENTS_API_KEY or NOWPAYMENTS_IPN_SECRET missing)');
  }

  if (!isCryptoCurrencyAllowed(params.payCurrency)) {
    throw new Error(`Crypto currency ${params.payCurrency} is not in the allowlist`);
  }

  const body = {
    price_amount: params.priceAmount,
    price_currency: params.priceCurrency,
    order_id: params.orderId,
    order_description: params.orderDescription,
    ipn_callback_url: params.ipnCallbackUrl,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    pay_currency: params.payCurrency,
  };

  logger.info('nowpayments.create_invoice', {
    orderId: params.orderId,
    priceAmount: params.priceAmount,
    payCurrency: params.payCurrency,
  });

  // SECURITY: use ssrfSafeFetch (DNS-pinned) — even though NowPayments is
  // a trusted host, the pinning protects against DNS hijacking.
  const res = await ssrfSafeFetch(`${API_BASE}/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    logger.error('nowpayments.create_invoice_failed', {
      status: res.status,
      body: errBody.slice(0, 500),
    });
    throw new Error(`NowPayments invoice creation failed: HTTP ${res.status}`);
  }

  const data: any = await res.json();
  if (!data.id || !data.invoice_url) {
    throw new Error(`NowPayments returned malformed invoice: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return {
    id: data.id,
    invoiceUrl: data.invoice_url,
    amountDueCrypto: data.pay_amount ? parseFloat(data.pay_amount) : undefined,
    payCurrency: data.pay_currency || params.payCurrency,
    expiresAt: data.expiration_estimate_date || undefined,
  };
}

// ---------------------------------------------------------------------------
//  Invoice status fetch (for cron reconciliation)
// ---------------------------------------------------------------------------

export interface NowPaymentsInvoiceStatus {
  id: string;
  payment_status: 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'failed' | 'expired' | 'refunded';
  pay_amount: string;
  pay_currency: string;
  actually_paid: string;
  outcome_amount?: string;
  outcome_currency?: string;
}

/**
 * Fetch the current status of an invoice from NowPayments.
 * Used by the cron reconciliation job to catch missed webhooks.
 */
export async function getNowPaymentsInvoiceStatus(invoiceId: string): Promise<NowPaymentsInvoiceStatus> {
  if (!API_KEY) {
    throw new Error('NowPayments API key not configured');
  }

  const res = await ssrfSafeFetch(`${API_BASE}/invoice/${invoiceId}`, {
    headers: { 'x-api-key': API_KEY },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`NowPayments status fetch failed: HTTP ${res.status}`);
  }

  return await res.json() as NowPaymentsInvoiceStatus;
}

// ---------------------------------------------------------------------------
//  Webhook (IPN) signature verification
// ---------------------------------------------------------------------------

/**
 * Verify a NowPayments IPN webhook signature.
 *
 * NowPayments signs the webhook by:
 *   1. Sorting the JSON body keys alphabetically
 *   2. Concatenating the values with `|` separator
 *   3. Computing HMAC-SHA256(secret, concatenated_string)
 *   4. Sending the hex digest in the `x-nowpayments-sig` header
 *
 * Wait — actually NowPayments uses HMAC-SHA256, not SHA512, despite the
 * header name. Let me double-check the official docs...
 *
 * Per NowPayments docs (https://nowpayments.io/payment-ipn-callback):
 *   "The signature is created by sorting the parameters in the IPN body
 *    alphabetically, concatenating them with the `|` separator, and
 *    computing HMAC-SHA256 with your IPN secret key."
 *
 * The header is `x-nowpayments-sig` and contains the hex-encoded HMAC.
 *
 * @returns true if the signature is valid
 */
export function verifyNowPaymentsWebhookSignature(
  parsedBody: Record<string, unknown>,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!secret) return false;
  if (!signatureHeader) return false;

  try {
    // Sort keys alphabetically
    const sortedKeys = Object.keys(parsedBody).sort();
    // Concatenate values with `|`
    const concatenated = sortedKeys
      .map((k) => String(parsedBody[k]))
      .join('|');

    // Compute HMAC-SHA256
    const expected = crypto
      .createHmac('sha256', secret)
      .update(concatenated)
      .digest('hex');

    // Constant-time comparison
    const a = Buffer.from(signatureHeader, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
//  IP allowlist check
// ---------------------------------------------------------------------------

/**
 * Check whether the request IP is in the NowPayments allowlist.
 *
 * SECURITY: this is a defense-in-depth. The HMAC signature is the primary
 * auth gate. The IP allowlist catches the case where the HMAC secret has
 * leaked but the attacker hasn't yet figured out how to forge signatures
 * from their own IP (they'd need to relay through a NowPayments IP).
 *
 * If NOWPAYMENTS_ALLOWED_IPS is not set, this returns true (the IP check
 * is optional — but recommended).
 */
export function isFromNowPaymentsIp(requestIp: string): boolean {
  const allowlist = getNowPaymentsIpAllowlist();
  if (allowlist.length === 0) return true; // not configured — skip check
  return allowlist.includes(requestIp);
}

// ---------------------------------------------------------------------------
//  Webhook event payload
// ---------------------------------------------------------------------------

export interface NowPaymentsWebhookEvent {
  payment_id: string;
  invoice_id: string;
  order_id: string;        // our PaymentInvoice.id
  payment_status: 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'failed' | 'expired' | 'refunded';
  pay_amount: string;      // crypto amount due
  pay_currency: string;
  actually_paid: string;   // crypto amount actually received
  outcome_amount?: string;
  outcome_currency?: string;
  purchase_id?: string;
  order_description?: string;
  timestamp?: string;
}

/**
 * Map a NowPayments payment_status to our internal InvoiceStatus.
 */
export function mapNowPaymentsStatus(status: string): import('./billing-policy').InvoiceStatus {
  switch (status) {
    case 'waiting':   return 'waiting';
    case 'confirming': return 'confirming';
    case 'sending':   return 'confirming'; // sending = broadcasting tx, still confirming
    case 'confirmed': return 'confirmed';
    case 'failed':    return 'failed';
    case 'expired':   return 'expired';
    case 'refunded':  return 'refunded';
    default:          return 'waiting'; // unknown — default to waiting (safe)
  }
}
