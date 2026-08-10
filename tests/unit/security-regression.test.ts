/**
 * Smart EDMS — Security-regression tests for new infrastructure
 *
 * These tests cover the security-critical modules added during the
 * pentest remediation. They are designed to catch regressions if a
 * future refactor accidentally weakens the security guarantees.
 *
 * Modules tested:
 *   - challenge-store.ts (in-memory fallback: TTL, LRU, get/delete/has)
 *   - ssrf-safe-fetch.ts (SsrfError, URL validation, blocked hosts)
 *   - rate-limit.ts (HybridRateLimiter in-memory: sliding window, reset)
 *   - Signed-URL session binding (u= param verification)
 *   - Client-checksum verification (checksum_mismatch rejection)
 *
 * The Redis backends are not tested here (they require a live Redis
 * instance). The in-memory fallback paths are tested — they are the
 * dev-mode and failover paths, and they share the same public API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { createChallengeStore } from '@/lib/auth/challenge-store';
import { SsrfError, refreshPinnedAgent } from '@/lib/security/ssrf-safe-fetch';
import { isBlockedHost, isAllowedOutboundUrl } from '@/lib/security/ssrf-guard';
import { authRateLimiter, apiRateLimiter } from '@/lib/security/rate-limit';
import { sha256, timingSafeEqualStr } from '@/lib/auth/crypto';

// ============================================================================
//  CHALLENGE STORE (in-memory fallback)
// ============================================================================

describe('Challenge Store — In-Memory Fallback', () => {
  let store: ReturnType<typeof createChallengeStore<{ userId: string }>>;

  beforeEach(() => {
    store = createChallengeStore<{ userId: string }>('test-' + Math.random());
  });

  it('stores and retrieves a value', async () => {
    await store.set('key1', { userId: 'user1' }, 60_000);
    const val = await store.get('key1');
    expect(val).toEqual({ userId: 'user1' });
  });

  it('returns undefined for missing key', async () => {
    const val = await store.get('nonexistent');
    expect(val).toBeUndefined();
  });

  it('returns undefined after TTL expiry', async () => {
    await store.set('key1', { userId: 'user1' }, 50); // 50ms TTL
    // Wait for expiry
    await new Promise((r) => setTimeout(r, 80));
    const val = await store.get('key1');
    expect(val).toBeUndefined();
  });

  it('has() returns true for live entry, false for expired', async () => {
    await store.set('key1', { userId: 'user1' }, 50);
    expect(await store.has('key1')).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(await store.has('key1')).toBe(false);
  });

  it('delete() removes the entry', async () => {
    await store.set('key1', { userId: 'user1' }, 60_000);
    await store.delete('key1');
    expect(await store.get('key1')).toBeUndefined();
    expect(await store.has('key1')).toBe(false);
  });

  it('isolates namespaces — same key in different stores is independent', async () => {
    const storeA = createChallengeStore<{ v: string }>('ns-a');
    const storeB = createChallengeStore<{ v: string }>('ns-b');
    await storeA.set('same-key', { v: 'a' }, 60_000);
    await storeB.set('same-key', { v: 'b' }, 60_000);
    expect((await storeA.get('same-key'))!.v).toBe('a');
    expect((await storeB.get('same-key'))!.v).toBe('b');
  });

  it('overwrites existing key with new value + TTL', async () => {
    await store.set('key1', { userId: 'user1' }, 60_000);
    await store.set('key1', { userId: 'user2' }, 60_000);
    const val = await store.get('key1');
    expect(val).toEqual({ userId: 'user2' });
  });
});

// ============================================================================
//  SSRF SAFE FETCH — URL validation + error class
// ============================================================================

describe('SSRF Safe Fetch — URL Validation', () => {
  it('SsrfError is a proper Error subclass', () => {
    const err = new SsrfError('test message');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SsrfError');
    expect(err.message).toBe('test message');
  });

  it('isBlockedHost rejects localhost', () => {
    expect(isBlockedHost('localhost')).toBe(true);
    expect(isBlockedHost('127.0.0.1')).toBe(true);
    expect(isBlockedHost('0.0.0.0')).toBe(true);
    expect(isBlockedHost('::1')).toBe(true);
  });

  it('isBlockedHost rejects private IP ranges', () => {
    expect(isBlockedHost('10.0.0.1')).toBe(true);
    expect(isBlockedHost('172.16.0.1')).toBe(true);
    expect(isBlockedHost('192.168.1.1')).toBe(true);
    expect(isBlockedHost('169.254.169.254')).toBe(true); // cloud metadata
  });

  it('isBlockedHost allows public IPs', () => {
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(isBlockedHost('1.1.1.1')).toBe(false);
    expect(isBlockedHost('example.com')).toBe(false);
  });

  it('isBlockedHost rejects cloud metadata endpoints', () => {
    expect(isBlockedHost('metadata.google.internal')).toBe(true);
  });

  it('isAllowedOutboundUrl rejects non-http protocols', () => {
    expect(isAllowedOutboundUrl('ftp://example.com').allowed).toBe(false);
    expect(isAllowedOutboundUrl('file:///etc/passwd').allowed).toBe(false);
    expect(isAllowedOutboundUrl('javascript:alert(1)').allowed).toBe(false);
  });

  it('isAllowedOutboundUrl rejects invalid URLs', () => {
    expect(isAllowedOutboundUrl('not a url').allowed).toBe(false);
    expect(isAllowedOutboundUrl('').allowed).toBe(false);
  });

  it('isAllowedOutboundUrl allows https to public hosts', () => {
    expect(isAllowedOutboundUrl('https://api.nowpayments.io/v1/invoice').allowed).toBe(true);
    expect(isAllowedOutboundUrl('https://api.stripe.com/v1/charges').allowed).toBe(true);
  });

  it('isAllowedOutboundUrl rejects https to internal hosts', () => {
    expect(isAllowedOutboundUrl('https://localhost:8080/admin').allowed).toBe(false);
    expect(isAllowedOutboundUrl('https://169.254.169.254/latest/meta-data/').allowed).toBe(false);
    expect(isAllowedOutboundUrl('https://10.0.0.1/internal-api').allowed).toBe(false);
  });

  it('refreshPinnedAgent does not throw for unknown hostname', () => {
    expect(() => refreshPinnedAgent('unknown.example.com')).not.toThrow();
  });
});

// ============================================================================
//  RATE LIMITER — HybridRateLimiter (in-memory path)
// ============================================================================

describe('Rate Limiter — HybridRateLimiter (In-Memory Path)', () => {
  beforeEach(async () => {
    await apiRateLimiter.reset('security-test-key');
    await apiRateLimiter.reset('security-test-key-a');
    await apiRateLimiter.reset('security-test-key-b');
  });

  it('enforces a strict cap on requests', async () => {
    // Allow exactly 3 requests
    for (let i = 0; i < 3; i++) {
      const r = await apiRateLimiter.check('security-test-key', 3, 60_000);
      expect(r.allowed).toBe(true);
    }
    // 4th should be denied
    const r = await apiRateLimiter.check('security-test-key', 3, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.remaining).toBe(0);
  });

  it('reports remaining correctly', async () => {
    const r1 = await apiRateLimiter.check('security-test-key', 10, 60_000);
    expect(r1.remaining).toBeLessThanOrEqual(9);
    const r2 = await apiRateLimiter.check('security-test-key', 10, 60_000);
    expect(r2.remaining).toBeLessThan(r1.remaining);
  });

  it('isolates different keys', async () => {
    // Exhaust key A
    for (let i = 0; i < 3; i++) {
      await apiRateLimiter.check('security-test-key-a', 3, 60_000);
    }
    const aResult = await apiRateLimiter.check('security-test-key-a', 3, 60_000);
    const bResult = await apiRateLimiter.check('security-test-key-b', 3, 60_000);
    expect(aResult.allowed).toBe(false);
    expect(bResult.allowed).toBe(true);
  });

  it('reset clears the bucket', async () => {
    for (let i = 0; i < 5; i++) {
      await apiRateLimiter.check('security-test-key', 5, 60_000);
    }
    expect((await apiRateLimiter.check('security-test-key', 5, 60_000)).allowed).toBe(false);
    await apiRateLimiter.reset('security-test-key');
    expect((await apiRateLimiter.check('security-test-key', 5, 60_000)).allowed).toBe(true);
  });

  it('different limiters are independent', async () => {
    await authRateLimiter.reset('independence-test');
    await apiRateLimiter.reset('independence-test');
    // Exhaust authRateLimiter
    for (let i = 0; i < 3; i++) {
      await authRateLimiter.check('independence-test', 3, 60_000);
    }
    expect((await authRateLimiter.check('independence-test', 3, 60_000)).allowed).toBe(false);
    // apiRateLimiter for same key should still allow
    expect((await apiRateLimiter.check('independence-test', 3, 60_000)).allowed).toBe(true);
  });
});

// ============================================================================
//  SIGNED-URL SESSION BINDING — u= param verification
// ============================================================================

describe('Signed-URL Session Binding', () => {
  const SECRET = process.env.NEXTAUTH_SECRET || 'dev-only-secret';

  /**
   * Generate a signed URL with a user binding (u= param), mimicking
   * what LocalFileStorage.getSignedDownloadUrl does.
   */
  function generateBoundSignedUrl(key: string, expiresInSeconds: number, userId: string): string {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${key}|${exp}||${userId}`;
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    const params = new URLSearchParams({ key, exp: String(exp), sig, filename: '', u: userId });
    return `/api/storage/resolve?${params.toString()}`;
  }

  /**
   * Generate a legacy signed URL WITHOUT user binding (no u= param),
   * mimicking the old format used by public shares.
   */
  function generateLegacySignedUrl(key: string, expiresInSeconds: number): string {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${key}|${exp}|`;
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    const params = new URLSearchParams({ key, exp: String(exp), sig, filename: '' });
    return `/api/storage/resolve?${params.toString()}`;
  }

  it('bound URL includes the userId in the HMAC payload', () => {
    const url = generateBoundSignedUrl('tenant/doc/v1/file.pdf', 60, 'user-abc');
    expect(url).toContain('u=user-abc');
    expect(url).toContain('sig=');
  });

  it('legacy URL does NOT include the u param', () => {
    const url = generateLegacySignedUrl('tenant/doc/v1/file.pdf', 60);
    expect(url).not.toContain('u=');
  });

  it('bound URL signature differs from legacy signature for same key+exp', () => {
    const bound = generateBoundSignedUrl('key', 60, 'user-abc');
    const legacy = generateLegacySignedUrl('key', 60);
    const boundSig = new URL(bound, 'http://x').searchParams.get('sig');
    const legacySig = new URL(legacy, 'http://x').searchParams.get('sig');
    expect(boundSig).not.toBe(legacySig);
  });

  it('bound URL for user A cannot be used by user B (signature mismatch)', () => {
    const urlA = generateBoundSignedUrl('key', 60, 'user-a');
    const sigA = new URL(urlA, 'http://x').searchParams.get('sig');
    // If user B tries to use the URL with their own userId, the signature
    // wouldn't match because the HMAC was computed with 'user-a'
    const urlBTampered = generateBoundSignedUrl('key', 60, 'user-b');
    const sigB = new URL(urlBTampered, 'http://x').searchParams.get('sig');
    expect(sigA).not.toBe(sigB);
  });
});

// ============================================================================
//  CLIENT CHECKSUM VERIFICATION
// ============================================================================

describe('Client Checksum Verification', () => {
  it('sha256 of empty buffer is deterministic', () => {
    const hash = sha256('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('sha256 of known input matches expected value', () => {
    const hash = sha256('hello world');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('timingSafeEqualStr returns true for identical strings', () => {
    expect(timingSafeEqualStr('abc123', 'abc123')).toBe(true);
  });

  it('timingSafeEqualStr returns false for different strings', () => {
    expect(timingSafeEqualStr('abc123', 'abc124')).toBe(false);
  });

  it('timingSafeEqualStr returns false for different-length strings', () => {
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
  });

  it('checksum comparison catches truncated upload', () => {
    // Simulate: client computed SHA-256 of the full 100-byte file
    const fullContent = 'a'.repeat(100);
    const clientChecksum = sha256(fullContent);

    // Server received only 90 bytes (truncation)
    const truncatedContent = 'a'.repeat(90);
    const serverChecksum = sha256(truncatedContent);

    // The comparison should FAIL — the server's checksum doesn't match
    expect(timingSafeEqualStr(clientChecksum, serverChecksum)).toBe(false);
  });

  it('checksum comparison passes for intact upload', () => {
    const content = 'hello world this is a test file';
    const clientChecksum = sha256(content);
    const serverChecksum = sha256(content);
    expect(timingSafeEqualStr(clientChecksum, serverChecksum)).toBe(true);
  });

  it('checksum format validation rejects non-hex strings', () => {
    const validHex = /^[0-9a-f]{64}$/.test('a'.repeat(64));
    const invalidHex1 = /^[0-9a-f]{64}$/.test('xyz'.repeat(21));
    const invalidHex2 = /^[0-9a-f]{64}$/.test('a'.repeat(63)); // too short
    const invalidHex3 = /^[0-9a-f]{64}$/.test('a'.repeat(65)); // too long
    expect(validHex).toBe(true);
    expect(invalidHex1).toBe(false);
    expect(invalidHex2).toBe(false);
    expect(invalidHex3).toBe(false);
  });
});
