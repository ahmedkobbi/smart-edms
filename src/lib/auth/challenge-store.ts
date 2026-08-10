/**
 * Smart EDMS — Distributed challenge/state store
 *
 * SECURITY FIX (M-AUTH-17 / L-AUTH-1/3/4/11): Previously the SSO state,
 * MFA pending token, passkey registration challenge, and passkey login
 * challenge were all in-process `Map`s. Two consequences:
 *
 *   1. Multi-instance breakage: in a deployment with >1 Node process (PM2
 *      cluster, Kubernetes replicas, serverless cold starts), the state
 *      issued by instance A is invisible to instance B handling the
 *      callback. Legitimate SSO logins, MFA-continue flows, and passkey
 *      logins fail randomly (~50% on a 2-instance deploy).
 *
 *   2. Unbounded memory growth / DoS: state entries expire after 5–10 min
 *      but only the MFA store has a periodic GC sweep. An attacker can
 *      grow the SSO stateStore indefinitely by spamming init requests.
 *
 * This module provides a unified abstraction:
 *
 *   - If Redis is configured (REDIS_URL set + reachable), state lives in
 *     Redis with a TTL matching the original in-memory expiry. Multi-
 *     instance deploys work transparently.
 *   - If Redis is NOT available (dev mode), fall back to an in-process
 *     Map with TTL + a hard 10 000-entry LRU cap. The cap prevents
 *     unbounded growth; LRU eviction removes the oldest entries first.
 *     A periodic sweep (60s) reclaims expired entries.
 *
 * The API mirrors Map: `set(key, value, ttlMs)`, `get(key)`, `delete(key)`,
 * `has(key)`. Values are JSON-serializable objects.
 */

import { getRedisConnection, isRedisAvailable } from '@/lib/queue/redis-queue';
import { logger } from '@/lib/config/logger';

const KEY_PREFIX = 'smart-edms:challenge:';

// ---------------------------------------------------------------------------
//  In-memory fallback (dev or no-Redis deploys)
// ---------------------------------------------------------------------------

interface MemEntry<V> {
  value: V;
  expiresAt: number;
}

const MAX_IN_MEMORY_ENTRIES = 10_000;

class InMemoryChallengeStore<V = unknown> {
  private store = new Map<string, MemEntry<V>>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Periodic GC sweep — clears expired entries every 60s.
    if (typeof setInterval !== 'undefined') {
      this.sweepTimer = setInterval(() => this.sweep(), 60_000);
      this.sweepTimer.unref?.();
    }
  }

  private sweep(): void {
    const now = Date.now();
    let deleted = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt < now) {
        this.store.delete(k);
        deleted++;
      }
    }
    if (deleted > 0) {
      logger.debug('challenge_store.swept', { deleted, remaining: this.store.size });
    }
  }

  async set(key: string, value: V, ttlMs: number): Promise<void> {
    // LRU cap: if at capacity, evict the oldest entry (Map preserves insertion order)
    while (this.store.size >= MAX_IN_MEMORY_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async get(key: string): Promise<V | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Move to end (LRU) — re-insert preserves order
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
//  Redis-backed implementation
// ---------------------------------------------------------------------------

class RedisChallengeStore<V = unknown> {
  constructor(private ns: string) {}

  private k(key: string): string {
    return `${KEY_PREFIX}${this.ns}:${key}`;
  }

  async set(key: string, value: V, ttlMs: number): Promise<void> {
    const conn = getRedisConnection();
    if (!conn) return;
    await conn.set(this.k(key), JSON.stringify(value), 'PX', ttlMs);
  }

  async get(key: string): Promise<V | undefined> {
    const conn = getRedisConnection();
    if (!conn) return undefined;
    const raw = await conn.get(this.k(key));
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as V;
    } catch {
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    const conn = getRedisConnection();
    if (!conn) return;
    await conn.del(this.k(key));
  }

  async has(key: string): Promise<boolean> {
    const conn = getRedisConnection();
    if (!conn) return false;
    const exists = await conn.exists(this.k(key));
    return exists === 1;
  }
}

// ---------------------------------------------------------------------------
//  Public API — auto-selects Redis or in-memory
// ---------------------------------------------------------------------------

export interface ChallengeStore<V = unknown> {
  set(key: string, value: V, ttlMs: number): Promise<void>;
  get(key: string): Promise<V | undefined>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * Create a named challenge store. Each namespace is isolated (key collision
 * is impossible across stores). Backed by Redis when available, in-memory
 * Map (with TTL + 10k LRU cap + 60s GC sweep) otherwise.
 */
export function createChallengeStore<V = unknown>(namespace: string): ChallengeStore<V> {
  // Try Redis first — if REDIS_URL is set, use the Redis backend.
  // The check is lazy (per-call) so a Redis outage degrades gracefully to
  // the in-memory fallback for the rest of the process's lifetime.
  const redisStore = new RedisChallengeStore<V>(namespace);
  const memStore = new InMemoryChallengeStore<V>();
  let preferRedis: boolean | null = null;

  async function shouldUseRedis(): Promise<boolean> {
    if (preferRedis !== null) return preferRedis;
    preferRedis = await isRedisAvailable();
    if (preferRedis) {
      logger.info('challenge_store.using_redis', { namespace });
    } else {
      logger.info('challenge_store.using_memory', { namespace });
    }
    return preferRedis;
  }

  return {
    async set(key, value, ttlMs) {
      try {
        if (await shouldUseRedis()) {
          await redisStore.set(key, value, ttlMs);
        } else {
          await memStore.set(key, value, ttlMs);
        }
      } catch (err) {
        // Redis failed mid-write — fall back to memory so the flow doesn't break
        logger.warn('challenge_store.set_fallback', { namespace, error: (err as Error).message });
        await memStore.set(key, value, ttlMs);
      }
    },
    async get(key) {
      try {
        if (await shouldUseRedis()) {
          return await redisStore.get(key);
        }
      } catch (err) {
        logger.warn('challenge_store.get_fallback', { namespace, error: (err as Error).message });
      }
      return memStore.get(key);
    },
    async delete(key) {
      try {
        if (await shouldUseRedis()) {
          await redisStore.delete(key);
        } else {
          await memStore.delete(key);
        }
      } catch (err) {
        await memStore.delete(key);
      }
    },
    async has(key) {
      try {
        if (await shouldUseRedis()) {
          return await redisStore.has(key);
        }
      } catch (err) {
        // fall through to memory
      }
      return memStore.has(key);
    },
  };
}
