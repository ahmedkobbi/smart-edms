/**
 * Smart EDMS — Job action (retry / cancel)
 * POST /api/admin/jobs/:id/retry   retry a failed job
 * POST /api/admin/jobs/:id/cancel  cancel/remove a job
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { retryJob, removeJob, type QueueName, QUEUE_NAMES } from '@/lib/queue/redis-queue';
import { z } from 'zod';

const actionSchema = z.object({
  action: z.enum(['retry', 'cancel']),
  queue: z.string().min(1),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.job.action', action: 'update', resourceType: 'job', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = actionSchema.parse(await req.json());
    const queueName = body.queue as QueueName;

    if (!QUEUE_NAMES[queueName]) {
      throw ApiError.badRequest('invalid_queue', `Queue must be one of: ${Object.keys(QUEUE_NAMES).join(', ')}`);
    }

    let success = false;
    if (body.action === 'retry') {
      success = await retryJob(queueName, params!.id);
    } else if (body.action === 'cancel') {
      success = await removeJob(queueName, params!.id);
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.job.action',
      action: body.action,
      resourceType: 'job',
      resourceId: params!.id,
      result: success ? 'allow' : 'deny',
      metadata: { queue: queueName, action: body.action },
    });

    return NextResponse.json({ ok: success });
  },
);
