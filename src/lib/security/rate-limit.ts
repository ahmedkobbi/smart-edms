/**
 * Smart EDMS — Rate limiting
 *
 * Simple in-memory sliding-window rate limiter.
 * For production with multiple instances, swap with Redis.
 */

interface RateBucket {
  timestamps: number[];
}

class RateLimiter {
  private buckets = new Map<string, RateBucket>();

  /**
   * Check whether key is allowed to perform maxRequests within windowMs.
   * Returns { allowed, retryAfterMs, remaining }.
   */
  check(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): { allowed: boolean; retryAfterMs: number; remaining: number } {
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

  reset(key: string) {
    this.buckets.delete(key);
  }
}

export const authRateLimiter = new RateLimiter();
export const apiRateLimiter = new RateLimiter();
export const uploadRateLimiter = new RateLimiter();

export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri;
  return 'unknown';
}
