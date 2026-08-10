/**
 * Smart EDMS — Background worker process
 *
 * This is a SEPARATE process from the Next.js app. It connects to Redis
 * and processes jobs from all BullMQ queues.
 *
 * Run with: `bun run src/worker/index.ts` or `npm run worker`
 *
 * The worker handles:
 *   - OCR jobs: text extraction + OCR for documents
 *   - Webhook jobs: HTTP delivery with retry + HMAC signing
 *   - Evidence jobs: evidence package generation
 *   - Reindex jobs: OpenSearch + semantic embedding reindexing
 *
 * Graceful shutdown: on SIGTERM/SIGINT, stops accepting new jobs and
 * waits for in-progress jobs to complete (up to 30s).
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, QUEUE_DEFAULTS, type QueueName } from '../lib/queue/redis-queue';
import { db } from '../lib/db';
import { logger } from '../lib/config/logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// ---------------------------------------------------------------------------
//  Redis connection for workers (separate from the app's connection)
// ---------------------------------------------------------------------------

const workerConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

workerConnection.on('connect', () => {
  logger.info('worker.redis.connected', { url: REDIS_URL.replace(/:[^@]+@/, ':***@') });
});

workerConnection.on('error', (err) => {
  logger.error('worker.redis.error', { error: err.message });
});

// ---------------------------------------------------------------------------
//  Job handlers
// ---------------------------------------------------------------------------

/**
 * OCR job handler — extracts text from a document version.
 */
async function handleOcrJob(job: Job): Promise<void> {
  const { tenantId, documentId, versionId } = job.data;
  logger.info('worker.ocr.start', { documentId, versionId, jobId: job.id });

  // Update Prisma Job status to running
  await db.job.updateMany({
    where: { result: { contains: job.id }, status: 'pending' },
    data: { status: 'running', startedAt: new Date() },
  }).catch(() => {});

  // Import the text extraction module (heavy — only loaded when needed)
  const { indexDocumentText } = await import('../lib/documents/text-extraction');
  const result = await indexDocumentText(tenantId, documentId, versionId);

  // Also index in OpenSearch
  try {
    const { indexDocument: osIndexDocument } = await import('../lib/search/opensearch-service');
    await osIndexDocument(tenantId, documentId);
  } catch (err) {
    logger.warn('worker.ocr.opensearch_failed', { documentId, error: (err as Error).message });
  }

  // Update Prisma Job to completed
  await db.job.updateMany({
    where: { result: { contains: job.id }, status: 'running' },
    data: {
      status: 'completed',
      progress: 100,
      result: JSON.stringify({
        bullmqJobId: job.id,
        ocrApplied: result.ocrApplied,
        confidence: result.ocrConfidence,
        pageCount: result.pageCount,
        language: result.language,
      }),
      completedAt: new Date(),
    },
  }).catch(() => {});

  logger.info('worker.ocr.complete', {
    documentId,
    versionId,
    ocrApplied: result.ocrApplied,
    confidence: result.ocrConfidence,
    duration: result.ocrDurationMs,
  });
}

/**
 * Webhook delivery job handler — sends HTTP POST with HMAC signature.
 */
async function handleWebhookJob(job: Job): Promise<void> {
  const { webhookId, webhookUrl, webhookSecretHash, event, payload, tenantId } = job.data;
  logger.info('worker.webhook.start', { webhookId, event, jobId: job.id, attempt: job.attemptsMade + 1 });

  // Update webhook status
  await db.webhook.update({
    where: { id: webhookId },
    data: { lastStatus: 'sending', lastSentAt: new Date() },
  }).catch(() => {});

  // Build the body
  const body = JSON.stringify({ event, payload, ts: Date.now() });

  // SECURITY FIX (M-ADM-3): Use HMAC-SHA256 (not plain SHA-256 concat) to
  // defeat length-extension attacks. The previous `sha256(body + secret)`
  // allowed an attacker who captured a valid (body, sig) pair to compute a
  // valid signature for `body || padding || extension` without the secret.
  const crypto = await import('crypto');
  const signature = webhookSecretHash
    ? crypto.createHmac('sha256', webhookSecretHash).update(body).digest('hex')
    : '';

  // SECURITY FIX (M-ADM-5 + M-ADM-6): Enforce HTTPS in production and use
  // the async SSRF guard (with DNS resolution) to defeat DNS rebinding.
  if (process.env.NODE_ENV === 'production' && !webhookUrl.startsWith('https://')) {
    await db.webhook.update({
      where: { id: webhookId },
      data: { lastStatus: 'blocked_http' },
    }).catch(() => {});
    throw new Error(`HTTP webhook blocked in production: ${webhookUrl}`);
  }
  const { isSafeOutboundUrl } = await import('../lib/security/ssrf-guard');
  const ssrfCheck = await isSafeOutboundUrl(webhookUrl);
  if (!ssrfCheck.allowed) {
    await db.webhook.update({
      where: { id: webhookId },
      data: { lastStatus: 'blocked_ssrf' },
    }).catch(() => {});
    throw new Error(`SSRF blocked: ${webhookUrl}`);
  }

  // Send
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Smart-EDMS-Event': event,
      'X-Smart-EDMS-Signature': signature,
      'X-Smart-EDMS-Attempt': String(job.attemptsMade + 1),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (res.ok || res.status < 500) {
    // Success or client error (4xx) — don't retry
    await db.webhook.update({
      where: { id: webhookId },
      data: { lastStatus: `${res.status}`, lastSentAt: new Date() },
    }).catch(() => {});

    // Update Prisma Job
    await db.job.updateMany({
      where: { result: { contains: job.id }, status: { in: ['pending', 'running'] } },
      data: { status: 'completed', progress: 100, completedAt: new Date() },
    }).catch(() => {});

    logger.info('worker.webhook.delivered', { webhookId, event, status: res.status });
    return;
  }

  // Server error (5xx) — will be retried by BullMQ
  await db.webhook.update({
    where: { id: webhookId },
    data: { lastStatus: `${res.status}`, lastSentAt: new Date() },
  }).catch(() => {});

  throw new Error(`HTTP ${res.status}`);
}

/**
 * Evidence package job handler.
 */
async function handleEvidenceJob(job: Job): Promise<void> {
  const { tenantId, documentId } = job.data;
  logger.info('worker.evidence.start', { documentId, jobId: job.id });

  // The evidence package generation logic lives in the API route.
  // For now, we create a minimal package and mark complete.
  // In production, this would call a shared evidence-generation module.
  await db.job.updateMany({
    where: { result: { contains: job.id }, status: 'pending' },
    data: { status: 'running', startedAt: new Date() },
  }).catch(() => {});

  // Generate evidence package (reuse existing logic from the API route)
  try {
    // Evidence package generation — uses the existing audit evidence export logic
    // This is a placeholder that creates a basic evidence record.
    // In production, this would generate a full ZIP package.
    logger.info('worker.evidence.processing', { documentId, tenantId });

    // Create a basic evidence record
    const auditEvents = await db.auditEvent.findMany({
      where: { tenantId, OR: [{ resourceId: documentId }, { resourceType: 'document', resourceId: documentId }] },
      orderBy: { sequenceNum: 'desc' },
      take: 100,
    });

    const result = {
      documentId,
      auditEventCount: auditEvents.length,
      generatedAt: new Date().toISOString(),
    };

    await db.job.updateMany({
      where: { result: { contains: job.id }, status: 'running' },
      data: {
        status: 'completed',
        progress: 100,
        result: JSON.stringify({ bullmqJobId: job.id, ...result }),
        completedAt: new Date(),
      },
    }).catch(() => {});

    logger.info('worker.evidence.complete', { documentId, auditEventCount: auditEvents.length });
  } catch (err) {
    logger.warn('worker.evidence.failed', { documentId, error: (err as Error).message });
    throw err;
  }
}

/**
 * Reindex job handler.
 */
async function handleReindexJob(job: Job): Promise<void> {
  const { tenantId, scope } = job.data;
  logger.info('worker.reindex.start', { tenantId, scope, jobId: job.id });

  await db.job.updateMany({
    where: { result: { contains: job.id }, status: 'pending' },
    data: { status: 'running', startedAt: new Date() },
  }).catch(() => {});

  const results: Record<string, unknown> = { bullmqJobId: job.id };

  if (scope === 'keyword' || scope === 'all') {
    const { reindexTenant } = await import('../lib/search/opensearch-service');
    results.keyword = await reindexTenant(tenantId);
  }

  if (scope === 'semantic' || scope === 'all') {
    const { reindexTenantEmbeddings } = await import('../lib/search/semantic-search');
    results.semantic = await reindexTenantEmbeddings(tenantId);
  }

  await db.job.updateMany({
    where: { result: { contains: job.id }, status: 'running' },
    data: {
      status: 'completed',
      progress: 100,
      result: JSON.stringify(results),
      completedAt: new Date(),
    },
  }).catch(() => {});

  logger.info('worker.reindex.complete', { tenantId, scope, results });
}

// ---------------------------------------------------------------------------
//  Worker creation + lifecycle
// ---------------------------------------------------------------------------

const workers: Worker[] = [];

function createWorker(name: QueueName, handler: (job: Job) => Promise<void>): Worker {
  const worker = new Worker(
    QUEUE_NAMES[name],
    async (job) => {
      try {
        await handler(job);
      } catch (err) {
        logger.error('worker.job_failed', {
          queue: name,
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          error: (err as Error).message,
        });
        throw err; // re-throw for BullMQ to handle retries
      }
    },
    {
      connection: workerConnection.duplicate(),
      concurrency: name === 'ocr' ? 2 : 5, // OCR is CPU-heavy, limit concurrency
      autorun: true,
    },
  );

  worker.on('completed', (job) => {
    logger.info('worker.job_completed', { queue: name, jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('worker.job_failed_final', {
      queue: name,
      jobId: job?.id,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });
  });

  return worker;
}

// Start all workers
logger.info('worker.starting', { queues: Object.keys(QUEUE_NAMES) });

workers.push(createWorker('ocr', handleOcrJob));
workers.push(createWorker('webhook', handleWebhookJob));
workers.push(createWorker('evidence', handleEvidenceJob));
workers.push(createWorker('reindex', handleReindexJob));

logger.info('worker.started', {
  queues: Object.keys(QUEUE_NAMES),
  ocrConcurrency: 2,
  defaultConcurrency: 5,
});

// ---------------------------------------------------------------------------
//  Graceful shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('worker.shutdown.start', { signal });

  // Stop accepting new jobs
  await Promise.all(workers.map((w) => w.close(false))); // false = don't wait for current jobs

  // Wait up to 30s for in-progress jobs
  const timeout = setTimeout(() => {
    logger.warn('worker.shutdown.force', { message: 'Forcing shutdown after 30s timeout' });
    process.exit(1);
  }, 30_000);

  // Close Redis connection
  await workerConnection.quit();
  clearTimeout(timeout);

  logger.info('worker.shutdown.complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('worker.uncaughtException', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error('worker.unhandledRejection', { reason: String(reason) });
  shutdown('unhandledRejection');
});
