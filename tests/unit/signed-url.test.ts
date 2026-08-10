/**
 * Smart EDMS — Signed URL security tests
 *
 * Tests HMAC-signed URL generation and verification.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

const SECRET = process.env.NEXTAUTH_SECRET || 'dev-only-secret';

function generateSignedUrl(key: string, expiresInSeconds: number, filename: string): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${key}|${exp}|${filename}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const params = new URLSearchParams({ key, exp: String(exp), sig, filename });
  return `/api/storage/resolve?${params.toString()}`;
}

function verifySignedUrl(url: string): { valid: boolean; reason?: string } {
  let params: URLSearchParams;
  try {
    params = new URL(url, 'http://localhost').searchParams;
  } catch {
    return { valid: false, reason: 'invalid URL' };
  }
  const key = params.get('key');
  const exp = params.get('exp');
  const sig = params.get('sig');
  const filename = params.get('filename') || '';

  if (!key || !exp || !sig) return { valid: false, reason: 'missing params' };

  const expNum = parseInt(exp, 10);
  if (isNaN(expNum) || expNum * 1000 < Date.now()) return { valid: false, reason: 'expired' };

  const payload = `${key}|${exp}|${filename}`;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'invalid signature' };
  }

  if (key.includes('..')) return { valid: false, reason: 'path traversal' };

  return { valid: true };
}

describe('Signed URL Security', () => {
  it('generates and verifies valid URL', () => {
    const url = generateSignedUrl('tenant1/doc1/v1/abc/file.pdf', 60, 'file.pdf');
    const result = verifySignedUrl(url);
    expect(result.valid).toBe(true);
  });

  it('rejects expired URL', () => {
    const url = generateSignedUrl('tenant1/doc1/v1/abc/file.pdf', -10, 'file.pdf');
    const result = verifySignedUrl(url);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects tampered signature', () => {
    const url = generateSignedUrl('tenant1/doc1/v1/abc/file.pdf', 60, 'file.pdf');
    // Flip one character in the signature
    const tampered = url.slice(0, -1) + (url.slice(-1) === 'a' ? 'b' : 'a');
    const result = verifySignedUrl(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid signature');
  });

  it('rejects path traversal in key', () => {
    const url = generateSignedUrl('../../etc/passwd', 60, 'passwd');
    const result = verifySignedUrl(url);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('path traversal');
  });

  it('rejects tampered filename (signature depends on filename)', () => {
    const url = generateSignedUrl('tenant1/doc1/v1/abc/file.pdf', 60, 'file.pdf');
    // Change filename in URL without changing signature
    const tampered = url.replace('filename=file.pdf', 'filename=evil.pdf');
    const result = verifySignedUrl(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid signature');
  });

  it('rejects missing parameters', () => {
    const result = verifySignedUrl('/api/storage/resolve?key=abc');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing params');
  });
});
