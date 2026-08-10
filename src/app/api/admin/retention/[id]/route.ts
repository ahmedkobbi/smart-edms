/**
 * Smart EDMS — Admin retention detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  retentionDays: z.number().int().min(1).max(36500).optional(),
  startTrigger: z.enum(['document.created', 'document.closed', 'document.lastModified']).optional(),
  dispositionAction: z.enum(['delete', 'archive', 'review']).optional(),
  requireApproval: z.boolean().optional(),
  appliesTo: z.string().optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.RETENTION_MANAGE,
    audit: { eventType: 'admin.retention.update', action: 'update', resourceType: 'retention', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const sched = await db.retentionSchedule.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!sched) throw ApiError.notFound('not_found', 'Retention schedule not found');

    const updated = await db.retentionSchedule.update({
      where: { id: sched.id },
      data: body,
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.retention.update',
      action: 'update',
      resourceType: 'retention',
      resourceId: sched.id,
      resourceName: sched.name,
      result: 'allow',
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({ schedule: updated });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.RETENTION_MANAGE,
    audit: { eventType: 'admin.retention.delete', action: 'delete', resourceType: 'retention', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const sched = await db.retentionSchedule.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!sched) throw ApiError.notFound('not_found', 'Retention schedule not found');

    const inUse = await db.document.count({ where: { retentionScheduleId: sched.id, tenantId: ctx.tenantId } });
    if (inUse > 0) throw ApiError.conflict('in_use', `Schedule is applied to ${inUse} documents`);

    await db.retentionSchedule.delete({ where: { id: sched.id } });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.retention.delete',
      action: 'delete',
      resourceType: 'retention',
      resourceId: sched.id,
      resourceName: sched.name,
      result: 'allow',
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  },
);
