/**
 * Smart EDMS — Job monitoring API
 * GET  /api/admin/jobs              list jobs + queue metrics
 * POST /api/admin/jobs/:id/retry    retry a failed job
 * POST /api/admin/jobs/:id/cancel   cancel/remove a job
 * POST /api/admin/queues/:name/pause   pause a queue
 * POST /api/admin/queues/:name/resume  resume a queue
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import {
  getQueueMetrics,
  getFailedJobs,
  retryJob,
  removeJob,
  pauseQueue,
  resumeQueue,
  type QueueName,
  QUEUE_NAMES,
} from '@/lib/queue/redis-queue';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_VIEW },
  async (req: NextRequest, ctx) => {
    // Get queue metrics from Redis (BullMQ)
    const queueMetrics = await getQueueMetrics();

    // SECURITY FIX (L-ADM-4): Add proper pagination for job history.
    // Previously the route used `take: 100` with no `page`/`skip` — for
    // tenants with >100 historical jobs, older records were invisible.
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '50', 10) || 50));
    const status = req.nextUrl.searchParams.get('status'); // 'completed' | 'failed' | 'active' | undefined
    const queueName = req.nextUrl.searchParams.get('queue'); // 'ocr' | 'webhook' | etc.

    const where = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(queueName ? { queueName } : {}),
    };

    const [jobs, total] = await Promise.all([
      db.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.job.count({ where }),
    ]);

    // Get failed jobs from each queue (for retry UI)
    const failedJobsByQueue: Record<string, any[]> = {};
    for (const qn of Object.keys(QUEUE_NAMES) as QueueName[]) {
      failedJobsByQueue[qn] = await getFailedJobs(qn, 0, 20);
    }

    return NextResponse.json({
      queues: queueMetrics,
      jobs: jobs.map((j) => ({
        ...j,
        result: j.result ? JSON.parse(j.result) : null,
      })),
      failedJobs: failedJobsByQueue,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  },
);
