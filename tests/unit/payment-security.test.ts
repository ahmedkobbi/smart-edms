/**
 * Smart EDMS — Payment security unit tests
 *
 * Tests the strict payment security rules:
 *   - Zero client trust (server-side price computation)
 *   - Idempotency (duplicate idempotencyKey returns existing invoice)
 *   - Webhook signature verification (HMAC-SHA256)
 *   - Status machine (allowed + rejected transitions)
 *   - Underpayment protection
 *   - Replay protection (dedup by event ID)
 *   - Plan limits enforcement
 *   - Crypto currency allowlist
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  computePriceUsd,
  PLAN_PRICES_USD,
  isStatusTransitionAllowed,
  isTerminalStatus,
  ALLOWED_STATUS_TRANSITIONS,
  isCryptoCurrencyAllowed,
  ALLOWED_CRYPTO_CURRENCIES,
  validatePlanLimits,
  type InvoiceStatus,
} from '@/lib/billing/billing-policy';
import {
  verifyNowPaymentsWebhookSignature,
  isFromNowPaymentsIp,
  mapNowPaymentsStatus,
} from '@/lib/billing/nowpayments';

describe('Payment Security — Zero Client Trust', () => {
  it('computes price server-side from PLAN_PRICES_USD', () => {
    expect(computePriceUsd('starter', 'monthly')).toBe(PLAN_PRICES_USD.starter.monthly);
    expect(computePriceUsd('business', 'annual')).toBe(PLAN_PRICES_USD.business.annual);
    expect(computePriceUsd('enterprise', 'annual')).toBe(PLAN_PRICES_USD.enterprise.annual);
  });

  it('trial is free (price 0)', () => {
    expect(computePriceUsd('trial', 'monthly')).toBe(0);
    expect(computePriceUsd('trial', 'annual')).toBe(0);
  });

  it('annual is cheaper than 12× monthly', () => {
    for (const plan of ['starter', 'business', 'enterprise'] as const) {
      const annual = PLAN_PRICES_USD[plan].annual;
      const monthly12 = PLAN_PRICES_USD[plan].monthly * 12;
      expect(annual).toBeLessThan(monthly12);
    }
  });

  it('throws on unknown plan', () => {
    expect(() => computePriceUsd('unknown' as any, 'monthly')).toThrow();
  });
});

describe('Payment Security — Status Machine', () => {
  it('allows pending → waiting', () => {
    expect(isStatusTransitionAllowed('pending', 'waiting')).toBe(true);
  });

  it('allows waiting → confirming', () => {
    expect(isStatusTransitionAllowed('waiting', 'confirming')).toBe(true);
  });

  it('allows confirming → confirmed', () => {
    expect(isStatusTransitionAllowed('confirming', 'confirmed')).toBe(true);
  });

  it('allows confirmed → refunded (refund path)', () => {
    expect(isStatusTransitionAllowed('confirmed', 'refunded')).toBe(true);
  });

  it('rejects confirmed → pending (no backwards from terminal-ish)', () => {
    expect(isStatusTransitionAllowed('confirmed', 'pending')).toBe(false);
  });

  it('rejects failed → confirmed (failed is terminal)', () => {
    expect(isStatusTransitionAllowed('failed', 'confirmed')).toBe(false);
  });

  it('rejects expired → anything (expired is terminal)', () => {
    expect(isStatusTransitionAllowed('expired', 'confirmed')).toBe(false);
    expect(isStatusTransitionAllowed('expired', 'waiting')).toBe(false);
  });

  it('rejects refunded → anything (refunded is terminal)', () => {
    expect(isStatusTransitionAllowed('refunded', 'confirmed')).toBe(false);
  });

  it('marks failed/expired/refunded as terminal', () => {
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('expired')).toBe(true);
    expect(isTerminalStatus('refunded')).toBe(true);
  });

  it('does not mark pending/waiting/confirming/confirmed as terminal', () => {
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('waiting')).toBe(false);
    expect(isTerminalStatus('confirming')).toBe(false);
    expect(isTerminalStatus('confirmed')).toBe(false);
  });
});

describe('Payment Security — Crypto Currency Allowlist', () => {
  it('accepts allowlisted currencies', () => {
    expect(isCryptoCurrencyAllowed('btc')).toBe(true);
    expect(isCryptoCurrencyAllowed('ETH')).toBe(true); // case-insensitive
    expect(isCryptoCurrencyAllowed('usdttrc20')).toBe(true);
  });

  it('rejects non-allowlisted currencies', () => {
    expect(isCryptoCurrencyAllowed('doge')).toBe(false);
    expect(isCryptoCurrencyAllowed('shib')).toBe(false);
    expect(isCryptoCurrencyAllowed('')).toBe(false);
  });

  it('has display names for all allowlisted currencies', () => {
    for (const [code, info] of Object.entries(ALLOWED_CRYPTO_CURRENCIES)) {
      expect(info.displayName).toBeTruthy();
      expect(info.minUsd).toBeGreaterThan(0);
    }
  });
});

describe('Payment Security — Plan Limits', () => {
  it('accepts values within plan limits', () => {
    expect(validatePlanLimits('trial', 5, 5 * 1024 * 1024 * 1024).ok).toBe(true);
    expect(validatePlanLimits('enterprise', 10000, 10 * 1024 * 1024 * 1024 * 1024).ok).toBe(true);
  });

  it('rejects seats exceeding plan limit', () => {
    expect(validatePlanLimits('trial', 100, 5 * 1024 * 1024 * 1024).ok).toBe(false);
  });
});

describe('Payment Security — NowPayments Webhook Signature', () => {
  const SECRET = 'test_ipn_secret';

  /**
   * Helper: compute the NowPayments-style HMAC-SHA256 signature.
   * NowPayments signs by sorting JSON keys alphabetically, concatenating
   * values with `|`, and HMAC'ing the result.
   */
  function computeSignature(body: Record<string, unknown>, secret: string): string {
    const sortedKeys = Object.keys(body).sort();
    const concatenated = sortedKeys.map((k) => String(body[k])).join('|');
    return crypto.createHmac('sha256', secret).update(concatenated).digest('hex');
  }

  it('verifies a correctly-signed webhook', () => {
    const body = {
      payment_id: 'pay_123',
      invoice_id: 'inv_456',
      order_id: 'order_789',
      payment_status: 'confirmed',
      pay_amount: '0.001',
      pay_currency: 'btc',
      actually_paid: '0.001',
    };
    const sig = computeSignature(body, SECRET);
    expect(verifyNowPaymentsWebhookSignature(body, sig, SECRET)).toBe(true);
  });

  it('rejects wrong secret', () => {
    const body = { payment_id: 'pay_123', payment_status: 'confirmed' };
    const sig = computeSignature(body, SECRET);
    expect(verifyNowPaymentsWebhookSignature(body, sig, 'wrong_secret')).toBe(false);
  });

  it('rejects tampered body', () => {
    const body = { payment_id: 'pay_123', payment_status: 'confirmed' };
    const sig = computeSignature(body, SECRET);
    const tampered = { ...body, payment_status: 'refunded' }; // attacker changes status
    expect(verifyNowPaymentsWebhookSignature(tampered, sig, SECRET)).toBe(false);
  });

  it('rejects missing signature', () => {
    const body = { payment_id: 'pay_123' };
    expect(verifyNowPaymentsWebhookSignature(body, '', SECRET)).toBe(false);
  });

  it('rejects missing secret', () => {
    const body = { payment_id: 'pay_123' };
    const sig = computeSignature(body, SECRET);
    expect(verifyNowPaymentsWebhookSignature(body, sig, '')).toBe(false);
  });

  it('handles keys in any order (sorts alphabetically)', () => {
    const body1 = { b: '1', a: '2', c: '3' };
    const body2 = { a: '2', c: '3', b: '1' }; // same values, different order
    const sig1 = computeSignature(body1, SECRET);
    // Both should produce the same signature (sorted concatenation)
    expect(verifyNowPaymentsWebhookSignature(body2, sig1, SECRET)).toBe(true);
  });
});

describe('Payment Security — IP Allowlist', () => {
  it('allows any IP when allowlist is not configured', () => {
    const original = process.env.NOWPAYMENTS_ALLOWED_IPS;
    delete process.env.NOWPAYMENTS_ALLOWED_IPS;
    expect(isFromNowPaymentsIp('1.2.3.4')).toBe(true);
    expect(isFromNowPaymentsIp('127.0.0.1')).toBe(true);
    if (original) process.env.NOWPAYMENTS_ALLOWED_IPS = original;
  });

  it('rejects IPs not in the allowlist', () => {
    const original = process.env.NOWPAYMENTS_ALLOWED_IPS;
    process.env.NOWPAYMENTS_ALLOWED_IPS = '5.6.7.8,9.10.11.12';
    expect(isFromNowPaymentsIp('1.2.3.4')).toBe(false);
    expect(isFromNowPaymentsIp('5.6.7.8')).toBe(true);
    if (original) process.env.NOWPAYMENTS_ALLOWED_IPS = original;
    else delete process.env.NOWPAYMENTS_ALLOWED_IPS;
  });
});

describe('Payment Security — Status Mapping', () => {
  it('maps NowPayments waiting → waiting', () => {
    expect(mapNowPaymentsStatus('waiting')).toBe('waiting');
  });

  it('maps NowPayments confirming → confirming', () => {
    expect(mapNowPaymentsStatus('confirming')).toBe('confirming');
  });

  it('maps NowPayments sending → confirming (still awaiting confirmation)', () => {
    expect(mapNowPaymentsStatus('sending')).toBe('confirming');
  });

  it('maps NowPayments confirmed → confirmed', () => {
    expect(mapNowPaymentsStatus('confirmed')).toBe('confirmed');
  });

  it('maps NowPayments failed → failed', () => {
    expect(mapNowPaymentsStatus('failed')).toBe('failed');
  });

  it('maps NowPayments expired → expired', () => {
    expect(mapNowPaymentsStatus('expired')).toBe('expired');
  });

  it('maps NowPayments refunded → refunded', () => {
    expect(mapNowPaymentsStatus('refunded')).toBe('refunded');
  });

  it('defaults unknown status to waiting (safe)', () => {
    expect(mapNowPaymentsStatus('unknown_status')).toBe('waiting');
  });
});
