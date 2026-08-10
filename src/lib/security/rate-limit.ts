/**
 * Smart EDMS — Rate limiting
 *
 * Two-backend sliding-window rate limiter:
 *
 *   1. Redis (when REDIS_URL is set + reachable) — uses INCR + EXPIRE on a
 *      sorted-set per key. Works across multiple instances (PM2 cluster,
 *      Kubernetes replicas) so an attacker rotating across instances no
 *      longer gets N× the rate limit.
 *
 *   2. In-memory Map (dev fallback) — sliding window of timestamps. Single-
 *      instance only. The class header used to acknowledge this limitation;
 *      it is now an automatic fallback, not the primary backend.
 *
 * The public API (`check(key, max, windowMs)`) is async to accommodate the
 * Redis round-trip. Existing call sites that used the sync API have been
 * migrated to await the result.
 *
 * SECURITY FIX (L-INFRA-10): Closes the multi-instance rate-limit bypass
 * where each instance had its own bucket — an attacker rotating across
 * instances got N× the configured limit. The Redis backend uses a single
 * bucket per key, shared across all instances.
 */

import { getRedisConnection, isRedisAvailable } from '@/lib/queue/redis-queue';
import { logger } from '@/lib/config/logger';

interface RateBucket {
  timestamps: number[];
}

/**
 * Result of a rate-limit check.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
}

// ---------------------------------------------------------------------------
//  In-memory backend (dev / single-instance fallback)
// ---------------------------------------------------------------------------

class InMemoryRateLimiter {
  private buckets = new Map<string, RateBucket>();

  check(key: string, maxRequests: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;
    const bucket = this.buckets.get(key) ?? { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= maxRequests) {
      const oldest = bucket.timestamps[0];
      const retryAfterMs = oldest + windowMs - now;
      this.buckets.set(key, bucket);
      return { allowed: false, retryAfterMs: Math.max(1000, retryAfterMs), remaining: 0 };
    }

    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: maxRequests - bucket.timestamps.length,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

// ---------------------------------------------------------------------------
//  Redis backend (production / multi-instance)
// ---------------------------------------------------------------------------
//
// Implementation: sorted-set sliding window.
//   - ZADD key <now> <now-unique>  (member is `${now}-${counter}` to ensure
//     uniqueness when multiple requests arrive in the same millisecond)
//   - ZREMRANGEBYSCORE key 0 <cutoff>  (drop expired entries)
//   - ZCARD key  (count current window)
//   - EXPIRE key <windowMs/1000 + 1>  (TTL so abandoned keys auto-clean)
//
// This is the canonical Redis rate-limit pattern (cf. Redis documentation
// "Rate limiter" pattern). All four commands run inside a MULTI/EXEC pipeline
// for atomicity and to keep round-trips at 1.

class RedisRateLimiter {
  private counter = 0;

  async check(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> {
    const conn = getRedisConnection();
    if (!conn) {
      // Should never happen — caller checks isRedisAvailable first. Defensive.
      return { allowed: true, retryAfterMs: 0, remaining: maxRequests };
    }

    const now = Date.now();
    const cutoff = now - windowMs;
    const redisKey = `smart-edms:rate-limit:${key}`;
    // Unique member: timestamp + process-unique counter. The counter is
    // incremented on every call to guarantee uniqueness even when two
    // requests arrive in the same millisecond.
    const member = `${now}-${process.pid}-${this.counter++}`;

    // Pipeline (atomic batch): add + prune + count + set TTL
    const pipeline = conn.multi();
    pipeline.zadd(redisKey, now, member);
    pipeline.zremrangebyscore(redisKey, 0, cutoff);
    pipeline.zcard(redisKey);
    pipeline.pexpire(redisKey, windowMs + 1000); // +1s grace to keep the window intact
    const results = await pipeline.exec();

    // results[2] = [error, count]
    const count = results && results[2] && typeof results[2][1] === 'number'
      ? (results[2][1] as number)
      : 0;

    if (count > maxRequests) {
      // The current request would exceed the limit. Remove the member we
      // just added so the window reflects only allowed requests (otherwise
      // a flood of denied requests would permanently saturate the window).
      await conn.zrem(redisKey, member).catch(() => {});
      // Compute retry-after from the oldest remaining entry.
      const oldest = await conn.zrange(redisKey, '0', '0', 'WITHSCORES').catch(() => [] as string[]);
      const oldestScore = oldest && oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
      const retryAfterMs = oldestScore + windowMs - now;
      return { allowed: false, retryAfterMs: Math.max(1000, retryAfterMs), remaining: 0 };
    }

    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(0, maxRequests - count),
    };
  }

  async reset(key: string): Promise<void> {
    const conn = getRedisConnection();
    if (!conn) return;
    await conn.del(`smart-edms:rate-limit:${key}`).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
//  Hybrid limiter — picks the backend per-call
// ---------------------------------------------------------------------------

class HybridRateLimiter {
  private mem = new InMemoryRateLimiter();
  private redis = new RedisRateLimiter();
  private preferRedis: boolean | null = null;
  private lastCheckAt = 0;
  private readonly RECHECK_MS = 30_000; // re-check Redis availability every 30s

  /**
   * Check whether key is allowed to perform maxRequests within windowMs.
   * Auto-selects Redis when available, falls back to in-memory otherwise.
   */
  async check(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> {
    // Re-check Redis availability periodically so we fail over to memory
    // within 30s of a Redis outage, and fail back within 30s of recovery.
    const now = Date.now();
    if (this.preferRedis === null || now - this.lastCheckAt > this.RECHECK_MS) {
      try {
        this.preferRedis = await isRedisAvailable();
      } catch {
        this.preferRedis = false;
      }
      this.lastCheckAt = now;
      if (this.preferRedis === true) {
        logger.info('rate_limiter.using_redis', { keyPrefix: key.split(':')[0] });
      } else if (this.preferRedis === false && process.env.REDIS_URL) {
        // Only log if Redis was expected but unavailable — avoids noise in dev
        logger.warn('rate_limiter.redis_unavailable_using_memory', { keyPrefix: key.split(':')[0] });
      }
    }

    if (this.preferRedis) {
      try {
        return await this.redis.check(key, maxRequests, windowMs);
      } catch (err) {
        // Redis failed mid-call — fail open is unsafe (lets attackers in),
        // fail closed is unsafe (locks out legitimate users on Redis blip).
        // Compromise: fall through to in-memory for THIS call, and mark
        // Redis as unavailable so subsequent calls skip the Redis attempt.
        logger.warn('rate_limiter.redis_error_fallback', { error: (err as Error).message });
        this.preferRedis = false;
        this.lastCheckAt = now;
      }
    }

    return this.mem.check(key, maxRequests, windowMs);
  }

  async reset(key: string): Promise<void> {
    if (this.preferRedis) {
      await this.redis.reset(key).catch(() => {});
    }
    this.mem.reset(key);
  }
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export const authRateLimiter = new HybridRateLimiter();
export const apiRateLimiter = new HybridRateLimiter();
export const uploadRateLimiter = new HybridRateLimiter();

export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri;
  return 'unknown';
}
