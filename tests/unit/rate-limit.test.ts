/**
 * Smart EDMS — Rate limiter tests
 *
 * Tests the sliding window rate limiter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { apiRateLimiter } from '@/lib/security/rate-limit';

describe('Rate Limiter', () => {
  beforeEach(() => {
    apiRateLimiter.reset('test-key');
  });

  it('allows requests within limit', () => {
    for (let i = 0; i < 5; i++) {
      const result = apiRateLimiter.check('test-key', 5, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks requests exceeding limit', () => {
    for (let i = 0; i < 5; i++) {
      apiRateLimiter.check('test-key', 5, 60_000);
    }
    const result = apiRateLimiter.check('test-key', 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('reports remaining requests', () => {
    const r1 = apiRateLimiter.check('test-key', 10, 60_000);
    expect(r1.remaining).toBe(9);
    const r2 = apiRateLimiter.check('test-key', 10, 60_000);
    expect(r2.remaining).toBe(8);
  });

  it('handles different keys independently', () => {
    for (let i = 0; i < 3; i++) {
      apiRateLimiter.check('key-a', 3, 60_000);
    }
    const aResult = apiRateLimiter.check('key-a', 3, 60_000);
    const bResult = apiRateLimiter.check('key-b', 3, 60_000);
    expect(aResult.allowed).toBe(false);
    expect(bResult.allowed).toBe(true);
  });

  it('reset clears the bucket', () => {
    for (let i = 0; i < 5; i++) {
      apiRateLimiter.check('test-key', 5, 60_000);
    }
    expect(apiRateLimiter.check('test-key', 5, 60_000).allowed).toBe(false);
    apiRateLimiter.reset('test-key');
    expect(apiRateLimiter.check('test-key', 5, 60_000).allowed).toBe(true);
  });
});
