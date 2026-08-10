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

    // Get recent job records from Prisma (for history)
    const jobs = await db.job.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Get failed jobs from each queue (for retry UI)
    const failedJobsByQueue: Record<string, any[]> = {};
    for (const queueName of Object.keys(QUEUE_NAMES) as QueueName[]) {
      failedJobsByQueue[queueName] = await getFailedJobs(queueName, 0, 20);
    }

    return NextResponse.json({
      queues: queueMetrics,
      jobs: jobs.map((j) => ({
        ...j,
        result: j.result ? JSON.parse(j.result) : null,
      })),
      failedJobs: failedJobsByQueue,
    });
  },
);
