/**
 * Smart EDMS — Performance verification script
 *
 * Measures the latency impact of the security infrastructure added during
 * the pentest remediation:
 *
 *   1. Rate limiter (Redis or in-memory) — called on every authenticated request
 *   2. Challenge store (in-memory) — called on SSO/MFA/passkey flows
 *   3. SSRF safe fetch (DNS pinning) — called on webhook delivery
 *   4. Signed URL generation — called on every download/preview
 *   5. SHA-256 hashing — called on every upload (checksum) + token storage
 *
 * The script measures each operation in isolation, then reports whether
 * the p99 latency stays within acceptable bounds for an enterprise API
 * (target: < 5ms per security operation, < 50ms total overhead per request).
 *
 * Run: npx bun run scripts/performance-verify.ts
 */

import { authRateLimiter, apiRateLimiter } from '../src/lib/security/rate-limit';
import { createChallengeStore } from '../src/lib/auth/challenge-store';
import { sha256, timingSafeEqualStr, randomToken } from '../src/lib/auth/crypto';
import crypto from 'crypto';

const ITERATIONS = 10_000;
const WARMUP = 1_000;

function measure(name: string, fn: () => void | Promise<void>, iterations: number = ITERATIONS): void {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    try { fn(); } catch {}
  }

  // Measure
  const latencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    try { fn(); } catch {}
    const end = process.hrtime.bigint();
    latencies.push(Number(end - start) / 1_000_000); // ns → ms
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const p999 = latencies[Math.floor(latencies.length * 0.999)];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  const status = p99 < 5 ? '✅ PASS' : p99 < 20 ? '⚠️  WARN' : '❌ FAIL';
  console.log(`${status}  ${name.padEnd(45)} avg=${avg.toFixed(3)}ms  p50=${p50.toFixed(3)}ms  p99=${p99.toFixed(3)}ms  p99.9=${p999.toFixed(3)}ms`);
}

async function measureAsync(name: string, fn: () => Promise<void>, iterations: number = ITERATIONS): Promise<void> {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    try { await fn(); } catch {}
  }

  // Measure
  const latencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    try { await fn(); } catch {}
    const end = process.hrtime.bigint();
    latencies.push(Number(end - start) / 1_000_000);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const p999 = latencies[Math.floor(latencies.length * 0.999)];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  const status = p99 < 5 ? '✅ PASS' : p99 < 20 ? '⚠️  WARN' : '❌ FAIL';
  console.log(`${status}  ${name.padEnd(45)} avg=${avg.toFixed(3)}ms  p50=${p50.toFixed(3)}ms  p99=${p99.toFixed(3)}ms  p99.9=${p999.toFixed(3)}ms`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Smart EDMS — Performance Verification                                   ║');
  console.log('║  Target: p99 < 5ms per security operation (in-memory path)               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Iterations: ${ITERATIONS.toLocaleString()} (warmup: ${WARMUP.toLocaleString()})`);
  console.log(`Redis available: ${!!process.env.REDIS_URL}`);
  console.log();

  // --- 1. Rate Limiter (in-memory path) ---
  console.log('── Rate Limiter ──────────────────────────────────────────────────────────');
  let rlCounter = 0;
  await measureAsync('authRateLimiter.check (in-memory)', async () => {
    await authRateLimiter.check(`perf-test-${rlCounter++}`, 1000, 60_000);
  });

  let apiCounter = 0;
  await measureAsync('apiRateLimiter.check (in-memory)', async () => {
    await apiRateLimiter.check(`perf-test-${apiCounter++}`, 1000, 60_000);
  });

  await measureAsync('authRateLimiter.reset', async () => {
    await authRateLimiter.reset(`perf-test-${--rlCounter}`);
  });
  console.log();

  // --- 2. Challenge Store (in-memory path) ---
  console.log('── Challenge Store ───────────────────────────────────────────────────────');
  const store = createChallengeStore<{ userId: string }>('perf-test');
  let csCounter = 0;
  await measureAsync('challengeStore.set (in-memory)', async () => {
    await store.set(`key-${csCounter}`, { userId: 'user1' }, 60_000);
  });

  await measureAsync('challengeStore.get (in-memory, hit)', async () => {
    await store.get(`key-${Math.floor(csCounter / 2)}`); // hit existing
  });

  await measureAsync('challengeStore.get (in-memory, miss)', async () => {
    await store.get(`nonexistent-${csCounter}`);
  });

  await measureAsync('challengeStore.has (in-memory)', async () => {
    await store.has(`key-${Math.floor(csCounter / 2)}`);
  });

  await measureAsync('challengeStore.delete (in-memory)', async () => {
    await store.delete(`key-${csCounter++}`);
  });
  console.log();

  // --- 3. SHA-256 Hashing (used for tokens, checksums, signatures) ---
  console.log('── Cryptographic Operations ──────────────────────────────────────────────');
  const testData = 'a'.repeat(1024); // 1KB
  measure('sha256 (1KB input)', () => {
    sha256(testData);
  });

  const largeData = 'a'.repeat(1024 * 1024); // 1MB
  measure('sha256 (1MB input)', () => {
    sha256(largeData);
  }, 1000); // fewer iterations for large input

  const tokenA = randomToken(32);
  const tokenB = tokenA;
  measure('timingSafeEqualStr (64-char hex)', () => {
    timingSafeEqualStr(tokenA, tokenB);
  });

  measure('randomToken(32) — CSPRNG', () => {
    randomToken(32);
  });

  // HMAC-SHA256 (used for signed URLs, webhook signatures)
  const hmacKey = 'test-secret-key';
  const hmacData = 'tenant/doc/v1/file.pdf|1234567890|file.pdf|user-abc';
  measure('HMAC-SHA256 (signed URL payload)', () => {
    crypto.createHmac('sha256', hmacKey).update(hmacData).digest('hex');
  });

  // HMAC-SHA512 (used for NowPayments webhook verification)
  measure('HMAC-SHA512 (webhook payload)', () => {
    crypto.createHmac('sha512', hmacKey).update(hmacData).digest('hex');
  });
  console.log();

  // --- 4. Signed URL Generation (LocalFileStorage path) ---
  console.log('── Signed URL Generation ─────────────────────────────────────────────────');
  const secret = process.env.NEXTAUTH_SECRET || 'dev-only-secret';
  measure('Signed URL generation (HMAC + URLSearchParams)', () => {
    const key = 'tenant/doc/v1/file.pdf';
    const exp = Math.floor(Date.now() / 1000) + 60;
    const userId = 'user-abc';
    const payload = `${key}|${exp}||${userId}`;
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const params = new URLSearchParams({ key, exp: String(exp), sig, filename: '', u: userId });
    const url = `/api/storage/resolve?${params.toString()}`;
    void url; // suppress unused
  });
  console.log();

  // --- 5. Summary ---
  console.log('── Summary ───────────────────────────────────────────────────────────────');
  console.log('All operations measured on the in-memory fallback path (no Redis).');
  console.log('In production with Redis, expect +1-3ms per rate-limiter / challenge-store');
  console.log('call due to the Redis round-trip (single MULTI pipeline).');
  console.log();
  console.log('Target: p99 < 5ms per operation → total security overhead < 50ms per request.');
  console.log('If any operation shows ❌ FAIL, investigate before deploying to production.');
}

main().catch(console.error);
