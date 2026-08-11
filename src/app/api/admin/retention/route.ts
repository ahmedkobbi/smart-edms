/**
 * Smart EDMS — Admin retention schedules
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RETENTION_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.retentionSchedule.findMany({
      where: { tenantId: ctx.targetTenantId },
      orderBy: { retentionDays: 'asc' },
      include: { _count: { select: { documents: true } } },
    });
    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  retentionDays: z.number().int().min(1).max(36500),
  startTrigger: z.enum(['document.created', 'document.closed', 'document.lastModified']),
  dispositionAction: z.enum(['delete', 'archive', 'review']),
  requireApproval: z.boolean().default(true),
  appliesTo: z.string().default('*'),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.RETENTION_MANAGE,
    audit: { eventType: 'admin.retention.create', action: 'create', resourceType: 'retention', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());
    const existing = await db.retentionSchedule.findFirst({
      where: { name: body.name, tenantId: ctx.targetTenantId },
    });
    if (existing) throw ApiError.conflict('exists', 'Schedule with this name already exists');

    const sched = await db.retentionSchedule.create({
      data: { ...body, tenantId: ctx.tenantId },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.retention.create',
      action: 'create',
      resourceType: 'retention',
      resourceId: sched.id,
      resourceName: sched.name,
      result: 'allow',
      metadata: { retentionDays: sched.retentionDays, dispositionAction: sched.dispositionAction },
    });

    return NextResponse.json({ schedule: sched }, { status: 201 });
  },
);
