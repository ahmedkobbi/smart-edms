/**
 * Smart EDMS — Redis connection + BullMQ queue definitions
 *
 * Architecture:
 *   - Redis is the backing store for all job queues
 *   - Each job type has its own Queue (producer) + Worker (consumer)
 *   - The Next.js app ENQUEUES jobs (creates Queue instances)
 *   - A separate worker process (src/worker/index.ts) CONSUMES jobs
 *   - Job state is synced to the Prisma `Job` model for admin visibility
 *
 * Connection:
 *   - Single shared ioredis instance (cached)
 *   - Configured via REDIS_URL env var (default: redis://localhost:6379)
 *   - Falls back to a no-op queue (in-process fire-and-forget) when Redis
 *     is unavailable — so dev mode without Redis still works
 *
 * Queues:
 *   - ocr: OCR text extraction (CPU-heavy, 3 retries, 5min timeout)
 *   - webhook: Webhook delivery (I/O-heavy, 4 retries, 10s timeout)
 *   - evidence: Evidence package generation (CPU+I/O, 2 retries, 2min timeout)
 *   - reindex: Search reindexing (I/O-heavy, 1 retry, 10min timeout)
 *   - bulk_import: Bulk document import (I/O-heavy, 1 retry, 30min timeout)
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '@/lib/config/logger';
import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
//  Redis connection (singleton)
// ---------------------------------------------------------------------------

let redisConnection: IORedis | null = null;
let redisAvailable = false;
let redisCheckedAt = 0;
const REDIS_RECHECK_INTERVAL_MS = 30_000;

/**
 * Get the shared Redis connection (singleton).
 * Returns null if REDIS_URL is not set.
 */
export function getRedisConnection(): IORedis | null {
  if (redisConnection) return redisConnection;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // BullMQ requires this
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 500, 5000),
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNRESET'];
        if (targetErrors.some((e) => err.message.includes(e))) return true;
        return false;
      },
    });

    redisConnection.on('error', (err) => {
      logger.warn('redis.error', { error: err.message });
      redisAvailable = false;
    });

    redisConnection.on('connect', () => {
      logger.info('redis.connected', { url: redisUrl.replace(/:[^@]+@/, ':***@') });
      redisAvailable = true;
    });

    redisConnection.on('close', () => {
      logger.warn('redis.disconnected');
      redisAvailable = false;
    });

    return redisConnection;
  } catch (err) {
    logger.warn('redis.connection_failed', { error: (err as Error).message });
    return null;
  }
}

/**
 * Check if Redis is available (cached with TTL to avoid hammering).
 */
export async function isRedisAvailable(): Promise<boolean> {
  const now = Date.now();
  if (redisAvailable && now - redisCheckedAt < REDIS_RECHECK_INTERVAL_MS) return true;
  if (!redisAvailable && now - redisCheckedAt < REDIS_RECHECK_INTERVAL_MS) return false;

  const conn = getRedisConnection();
  if (!conn) {
    redisCheckedAt = now;
    return false;
  }

  try {
    const result = await conn.ping();
    redisAvailable = result === 'PONG';
    redisCheckedAt = now;
    return redisAvailable;
  } catch {
    redisAvailable = false;
    redisCheckedAt = now;
    return false;
  }
}

// ---------------------------------------------------------------------------
//  Queue definitions
// ---------------------------------------------------------------------------

export const QUEUE_NAMES = {
  ocr: 'smart-edms:ocr',
  webhook: 'smart-edms:webhook',
  evidence: 'smart-edms:evidence',
  reindex: 'smart-edms:reindex',
  bulkImport: 'smart-edms:bulk-import',
} as const;

export type QueueName = keyof typeof QUEUE_NAMES;

export const QUEUE_DEFAULTS: Record<QueueName, {
  attempts: number;
  timeout: number;
  backoff: { type: 'exponential' | 'fixed'; delay: number };
  removeOnComplete: number;
  removeOnFail: number;
}> = {
  ocr: {
    attempts: 3,
    timeout: 5 * 60 * 1000,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  webhook: {
    attempts: 4,
    timeout: 30_000,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: 200,
    removeOnFail: 1000,
  },
  evidence: {
    attempts: 2,
    timeout: 2 * 60 * 1000,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  reindex: {
    attempts: 1,
    timeout: 10 * 60 * 1000,
    backoff: { type: 'fixed', delay: 5_000 },
    removeOnComplete: 10,
    removeOnFail: 50,
  },
  bulkImport: {
    attempts: 1,
    timeout: 30 * 60 * 1000,
    backoff: { type: 'fixed', delay: 10_000 },
    removeOnComplete: 10,
    removeOnFail: 50,
  },
};

const queueCache = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const cached = queueCache.get(name);
  if (cached) return cached;

  const queue = new Queue(QUEUE_NAMES[name], {
    connection: conn.duplicate(),
    defaultJobOptions: {
      attempts: QUEUE_DEFAULTS[name].attempts,
      backoff: QUEUE_DEFAULTS[name].backoff,
      removeOnComplete: QUEUE_DEFAULTS[name].removeOnComplete,
      removeOnFail: QUEUE_DEFAULTS[name].removeOnFail,
    } as any,
  });

  queueCache.set(name, queue);
  return queue;
}

// ---------------------------------------------------------------------------
//  Job sync — Prisma Job model
// ---------------------------------------------------------------------------

export async function createJobRecord(opts: {
  tenantId: string;
  type: string;
  bullmqJobId: string;
  startedBy?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.job.create({
      data: {
        tenantId: opts.tenantId,
        type: opts.type,
        status: 'pending',
        progress: 0,
        startedBy: opts.startedBy || null,
        result: JSON.stringify({ bullmqJobId: opts.bullmqJobId, ...opts.metadata }),
      },
    });
  } catch (err) {
    logger.warn('job.record_create_failed', { error: (err as Error).message });
  }
}

export async function completeJobRecord(opts: {
  tenantId: string;
  bullmqJobId: string;
  result?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.job.updateMany({
      where: {
        tenantId: opts.tenantId,
        result: { contains: opts.bullmqJobId },
        status: { in: ['pending', 'running'] },
      },
      data: {
        status: 'completed',
        progress: 100,
        result: JSON.stringify({ bullmqJobId: opts.bullmqJobId, ...opts.result }),
        completedAt: new Date(),
      },
    });
  } catch (err) {
    logger.warn('job.record_complete_failed', { error: (err as Error).message });
  }
}

export async function failJobRecord(opts: {
  tenantId: string;
  bullmqJobId: string;
  error: string;
}): Promise<void> {
  try {
    await db.job.updateMany({
      where: {
        tenantId: opts.tenantId,
        result: { contains: opts.bullmqJobId },
        status: { in: ['pending', 'running'] },
      },
      data: {
        status: 'failed',
        error: opts.error.slice(0, 5000),
        completedAt: new Date(),
      },
    });
  } catch (err) {
    logger.warn('job.record_fail_failed', { error: (err as Error).message });
  }
}

// ---------------------------------------------------------------------------
//  Enqueue helpers
// ---------------------------------------------------------------------------

export async function enqueueOcrJob(opts: {
  tenantId: string;
  documentId: string;
  versionId: string;
  mimeType: string;
  storageKey: string;
  startedBy?: string;
}): Promise<{ queued: boolean; jobId?: string }> {
  const queue = getQueue('ocr');
  if (!queue) {
    // Fallback: in-process fire-and-forget (dev without Redis)
    const { indexDocumentText } = await import('@/lib/documents/text-extraction');
    indexDocumentText(opts.tenantId, opts.documentId, opts.versionId).catch(() => {});
    return { queued: false };
  }

  const job = await queue.add('ocr', {
    tenantId: opts.tenantId,
    documentId: opts.documentId,
    versionId: opts.versionId,
    mimeType: opts.mimeType,
    storageKey: opts.storageKey,
    startedBy: opts.startedBy,
  }, {
    jobId: `ocr:${opts.versionId}`,
  });

  await createJobRecord({
    tenantId: opts.tenantId,
    type: 'ocr',
    bullmqJobId: job.id!,
    startedBy: opts.startedBy,
    metadata: { documentId: opts.documentId, versionId: opts.versionId },
  });

  logger.info('job.ocr.queued', { documentId: opts.documentId, versionId: opts.versionId, jobId: job.id });
  return { queued: true, jobId: job.id };
}

export async function enqueueWebhookJob(opts: {
  tenantId: string;
  webhookId: string;
  webhookUrl: string;
  webhookSecretHash?: string;
  event: string;
  payload: Record<string, unknown>;
}): Promise<{ queued: boolean; jobId?: string }> {
  const queue = getQueue('webhook');
  if (!queue) return { queued: false };

  const job = await queue.add('webhook', opts, {
    jobId: `webhook:${opts.webhookId}:${opts.event}:${Date.now()}`,
  });

  return { queued: true, jobId: job.id };
}

export async function enqueueEvidenceJob(opts: {
  tenantId: string;
  documentId: string;
  startedBy: string;
}): Promise<{ queued: boolean; jobId?: string }> {
  const queue = getQueue('evidence');
  if (!queue) return { queued: false };

  const job = await queue.add('evidence', opts, {
    jobId: `evidence:${opts.documentId}:${Date.now()}`,
  });

  await createJobRecord({
    tenantId: opts.tenantId,
    type: 'evidence_package',
    bullmqJobId: job.id!,
    startedBy: opts.startedBy,
    metadata: { documentId: opts.documentId },
  });

  return { queued: true, jobId: job.id };
}

export async function enqueueReindexJob(opts: {
  tenantId: string;
  scope: 'keyword' | 'semantic' | 'all';
  startedBy: string;
}): Promise<{ queued: boolean; jobId?: string }> {
  const queue = getQueue('reindex');
  if (!queue) return { queued: false };

  const job = await queue.add('reindex', opts, {
    jobId: `reindex:${opts.tenantId}:${opts.scope}:${Date.now()}`,
  });

  await createJobRecord({
    tenantId: opts.tenantId,
    type: 'search_reindex',
    bullmqJobId: job.id!,
    startedBy: opts.startedBy,
    metadata: { scope: opts.scope },
  });

  return { queued: true, jobId: job.id };
}

// ---------------------------------------------------------------------------
//  Queue metrics + admin operations
// ---------------------------------------------------------------------------

export interface QueueMetrics {
  name: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export async function getQueueMetrics(): Promise<QueueMetrics[]> {
  const conn = getRedisConnection();
  if (!conn) return [];

  const results: QueueMetrics[] = [];

  for (const name of Object.keys(QUEUE_NAMES) as QueueName[]) {
    try {
      const queue = getQueue(name);
      if (!queue) continue;

      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.isPaused(),
      ]);

      results.push({ name, waiting, active, completed, failed, delayed, paused });
    } catch (err) {
      logger.warn('queue.metrics_failed', { queue: name, error: (err as Error).message });
    }
  }

  return results;
}

export async function getFailedJobs(name: QueueName, start = 0, count = 50): Promise<any[]> {
  const queue = getQueue(name);
  if (!queue) return [];

  try {
    const jobs = await queue.getFailed(start, start + count - 1);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));
  } catch {
    return [];
  }
}

export async function retryJob(name: QueueName, jobId: string): Promise<boolean> {
  const queue = getQueue(name);
  if (!queue) return false;
  try {
    const job = await queue.getJob(jobId);
    if (!job) return false;
    await job.retry();
    return true;
  } catch {
    return false;
  }
}

export async function removeJob(name: QueueName, jobId: string): Promise<boolean> {
  const queue = getQueue(name);
  if (!queue) return false;
  try {
    const job = await queue.getJob(jobId);
    if (!job) return false;
    await job.remove();
    return true;
  } catch {
    return false;
  }
}

export async function pauseQueue(name: QueueName): Promise<boolean> {
  const queue = getQueue(name);
  if (!queue) return false;
  await queue.pause();
  return true;
}

export async function resumeQueue(name: QueueName): Promise<boolean> {
  const queue = getQueue(name);
  if (!queue) return false;
  await queue.resume();
  return true;
}
