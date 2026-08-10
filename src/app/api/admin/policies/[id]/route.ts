/**
 * Smart EDMS — Admin policy detail
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
  effect: z.enum(['allow', 'deny']).optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  conditions: z.record(z.unknown()).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.policy.update', action: 'update', resourceType: 'policy', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const policy = await db.policy.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!policy) throw ApiError.notFound('not_found', 'Policy not found');

    const updated = await db.policy.update({
      where: { id: policy.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.effect !== undefined ? { effect: body.effect } : {}),
        ...(body.action !== undefined ? { action: body.action } : {}),
        ...(body.resource !== undefined ? { resource: body.resource } : {}),
        ...(body.conditions !== undefined ? { conditions: JSON.stringify(body.conditions) } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.policy.update',
      action: 'update',
      resourceType: 'policy',
      resourceId: policy.id,
      resourceName: policy.name,
      result: 'allow',
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({ policy: { ...updated, conditions: JSON.parse(updated.conditions || '{}') } });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.policy.delete', action: 'delete', resourceType: 'policy', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const policy = await db.policy.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!policy) throw ApiError.notFound('not_found', 'Policy not found');

    await db.policy.delete({ where: { id: policy.id } });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.policy.delete',
      action: 'delete',
      resourceType: 'policy',
      resourceId: policy.id,
      resourceName: policy.name,
      result: 'allow',
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  },
);
