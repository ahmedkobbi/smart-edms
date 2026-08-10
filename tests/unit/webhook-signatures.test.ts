/**
 * Smart EDMS — Webhook HMAC signature tests
 *
 * Tests the webhook signing and verification flow.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('Webhook HMAC Signatures', () => {
  const SECRET = 'whsec_test_secret_12345';

  function signPayload(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  function verifyPayload(body: string, signature: string, secret: string): boolean {
    const expected = signPayload(body, secret);
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  it('generates and verifies valid signature', () => {
    const body = JSON.stringify({ event: 'document.created', payload: { id: 'doc-1' } });
    const sig = signPayload(body, SECRET);
    expect(verifyPayload(body, sig, SECRET)).toBe(true);
  });

  it('rejects tampered body', () => {
    const body = JSON.stringify({ event: 'document.created', payload: { id: 'doc-1' } });
    const sig = signPayload(body, SECRET);
    const tamperedBody = body.replace('doc-1', 'doc-2');
    expect(verifyPayload(tamperedBody, sig, SECRET)).toBe(false);
  });

  it('rejects wrong secret', () => {
    const body = JSON.stringify({ event: 'document.created' });
    const sig = signPayload(body, 'wrong_secret');
    expect(verifyPayload(body, sig, SECRET)).toBe(false);
  });

  it('rejects empty signature', () => {
    expect(verifyPayload('{}', '', SECRET)).toBe(false);
  });

  it('handles Arabic content in payload', () => {
    const body = JSON.stringify({ event: 'document.created', title: 'مستند سري' });
    const sig = signPayload(body, SECRET);
    expect(verifyPayload(body, sig, SECRET)).toBe(true);
  });

  it('produces different signatures for different payloads', () => {
    const sig1 = signPayload('{"id":1}', SECRET);
    const sig2 = signPayload('{"id":2}', SECRET);
    expect(sig1).not.toBe(sig2);
  });
});
