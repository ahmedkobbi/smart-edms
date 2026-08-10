/**
 * Smart EDMS — Rate limiter tests
 *
 * Tests the hybrid (Redis-when-available, in-memory-fallback) sliding
 * window rate limiter. The limiter is async to accommodate the Redis
 * round-trip; tests run without REDIS_URL so they exercise the in-memory
 * fallback path.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { apiRateLimiter } from '@/lib/security/rate-limit';

describe('Rate Limiter', () => {
  beforeEach(async () => {
    await apiRateLimiter.reset('test-key');
    await apiRateLimiter.reset('key-a');
    await apiRateLimiter.reset('key-b');
  });

  it('allows requests within limit', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await apiRateLimiter.check('test-key', 5, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks requests exceeding limit', async () => {
    for (let i = 0; i < 5; i++) {
      await apiRateLimiter.check('test-key', 5, 60_000);
    }
    const result = await apiRateLimiter.check('test-key', 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('reports remaining requests', async () => {
    const r1 = await apiRateLimiter.check('test-key', 10, 60_000);
    expect(r1.remaining).toBeLessThanOrEqual(9);
    const r2 = await apiRateLimiter.check('test-key', 10, 60_000);
    expect(r2.remaining).toBeLessThanOrEqual(8);
    expect(r2.remaining).toBeLessThan(r1.remaining);
  });

  it('handles different keys independently', async () => {
    for (let i = 0; i < 3; i++) {
      await apiRateLimiter.check('key-a', 3, 60_000);
    }
    const aResult = await apiRateLimiter.check('key-a', 3, 60_000);
    const bResult = await apiRateLimiter.check('key-b', 3, 60_000);
    expect(aResult.allowed).toBe(false);
    expect(bResult.allowed).toBe(true);
  });

  it('reset clears the bucket', async () => {
    for (let i = 0; i < 5; i++) {
      await apiRateLimiter.check('test-key', 5, 60_000);
    }
    expect((await apiRateLimiter.check('test-key', 5, 60_000)).allowed).toBe(false);
    await apiRateLimiter.reset('test-key');
    expect((await apiRateLimiter.check('test-key', 5, 60_000)).allowed).toBe(true);
  });
});
