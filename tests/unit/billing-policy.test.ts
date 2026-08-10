/**
 * Smart EDMS — Billing policy unit tests
 *
 * Tests the plan-transition allowlist, plan limits, and Stripe webhook
 * signature verification.
 */

import { describe, it, expect } from 'vitest';
import {
  isPlanTransitionAllowed,
  validatePlanLimits,
  verifyStripeWebhookSignature,
  getBillingMode,
  PLAN_LIMITS,
} from '@/lib/billing/billing-policy';

describe('Billing Policy', () => {
  describe('isPlanTransitionAllowed', () => {
    it('allows same-plan transitions', () => {
      const r = isPlanTransitionAllowed('trial', 'trial');
      expect(r.allowed).toBe(true);
      expect(r.suspicious).toBe(false);
    });

    it('allows one-tier upgrades without flagging', () => {
      expect(isPlanTransitionAllowed('trial', 'starter').suspicious).toBe(false);
      expect(isPlanTransitionAllowed('starter', 'business').suspicious).toBe(false);
      expect(isPlanTransitionAllowed('business', 'enterprise').suspicious).toBe(false);
    });

    it('flags multi-tier upgrades as suspicious', () => {
      const r = isPlanTransitionAllowed('trial', 'enterprise');
      expect(r.allowed).toBe(true);
      expect(r.suspicious).toBe(true);
      expect(r.reason).toContain('Skipping');
    });

    it('flags downgrade to trial as suspicious', () => {
      const r = isPlanTransitionAllowed('enterprise', 'trial');
      expect(r.allowed).toBe(true);
      expect(r.suspicious).toBe(true);
    });

    it('allows paid-tier downgrades without flagging', () => {
      const r = isPlanTransitionAllowed('enterprise', 'business');
      expect(r.allowed).toBe(true);
      expect(r.suspicious).toBe(false);
    });
  });

  describe('validatePlanLimits', () => {
    it('accepts values within plan limits', () => {
      expect(validatePlanLimits('trial', 5, 5 * 1024 * 1024 * 1024).ok).toBe(true);
      expect(validatePlanLimits('enterprise', 10_000, 10 * 1024 * 1024 * 1024 * 1024).ok).toBe(true);
    });

    it('rejects seats exceeding plan limit', () => {
      const r = validatePlanLimits('trial', 100, 5 * 1024 * 1024 * 1024);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Seats');
    });

    it('rejects storage exceeding plan limit', () => {
      const r = validatePlanLimits('starter', 10, 999 * 1024 * 1024 * 1024);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Storage');
    });

    it('each plan has higher limits than the previous', () => {
      expect(PLAN_LIMITS.trial.maxSeats).toBeLessThan(PLAN_LIMITS.starter.maxSeats);
      expect(PLAN_LIMITS.starter.maxSeats).toBeLessThan(PLAN_LIMITS.business.maxSeats);
      expect(PLAN_LIMITS.business.maxSeats).toBeLessThan(PLAN_LIMITS.enterprise.maxSeats);
    });
  });

  describe('getBillingMode', () => {
    it('returns "manual" when STRIPE_SECRET_KEY is not set', () => {
      const original = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;
      expect(getBillingMode()).toBe('manual');
      if (original) process.env.STRIPE_SECRET_KEY = original;
    });

    it('returns "stripe" when STRIPE_SECRET_KEY is set', () => {
      const original = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key_for_testing';
      expect(getBillingMode()).toBe('stripe');
      if (original) process.env.STRIPE_SECRET_KEY = original;
      else delete process.env.STRIPE_SECRET_KEY;
    });
  });

  describe('verifyStripeWebhookSignature', () => {
    it('rejects missing secret', async () => {
      const r = await verifyStripeWebhookSignature('body', 'sig', '');
      expect(r.valid).toBe(false);
      expect(r.reason).toContain('not configured');
    });

    it('rejects missing signature header', async () => {
      const r = await verifyStripeWebhookSignature('body', '', 'whsec_test');
      expect(r.valid).toBe(false);
      expect(r.reason).toContain('Missing');
    });

    it('rejects malformed signature header', async () => {
      const r = await verifyStripeWebhookSignature('body', 'malformed', 'whsec_test');
      expect(r.valid).toBe(false);
      expect(r.reason).toContain('Malformed');
    });

    it('rejects signature with stale timestamp (replay protection)', async () => {
      // Timestamp 10 minutes ago — outside the 5-min tolerance
      const staleTs = Math.floor((Date.now() - 10 * 60 * 1000) / 1000);
      const sig = `t=${staleTs},v1=deadbeef`;
      const r = await verifyStripeWebhookSignature('body', sig, 'whsec_test');
      expect(r.valid).toBe(false);
      expect(r.reason).toContain('tolerance');
    });

    it('verifies a correctly-signed request', async () => {
      const crypto = await import('crypto');
      const secret = 'whsec_test_secret';
      const body = '{"type":"test"}';
      const ts = Math.floor(Date.now() / 1000);
      const expected = crypto
        .createHmac('sha256', secret)
        .update(`${ts}.${body}`)
        .digest('hex');
      const sig = `t=${ts},v1=${expected}`;
      const r = await verifyStripeWebhookSignature(body, sig, secret);
      expect(r.valid).toBe(true);
    });

    it('rejects wrong secret', async () => {
      const crypto = await import('crypto');
      const body = '{"type":"test"}';
      const ts = Math.floor(Date.now() / 1000);
      const expected = crypto
        .createHmac('sha256', 'whsec_correct')
        .update(`${ts}.${body}`)
        .digest('hex');
      const sig = `t=${ts},v1=${expected}`;
      const r = await verifyStripeWebhookSignature(body, sig, 'whsec_wrong');
      expect(r.valid).toBe(false);
      expect(r.reason).toContain('mismatch');
    });
  });
});
