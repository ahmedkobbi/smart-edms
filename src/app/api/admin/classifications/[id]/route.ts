/**
 * Smart EDMS — Admin classification detail
 * PATCH  /api/admin/classifications/:id
 * DELETE /api/admin/classifications/:id   (system classifications cannot be deleted)
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
  level: z.number().int().min(0).max(99).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  defaultPolicy: z.record(z.unknown()).optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE,
    audit: { eventType: 'admin.classification.update', action: 'update', resourceType: 'classification', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const cls = await db.classification.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!cls) throw ApiError.notFound('classification_not_found', 'Classification not found');

    const updated = await db.classification.update({
      where: { id: cls.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.level !== undefined ? { level: body.level } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.defaultPolicy !== undefined ? { defaultPolicy: JSON.stringify(body.defaultPolicy) } : {}),
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.classification.update',
      action: 'update',
      resourceType: 'classification',
      resourceId: cls.id,
      resourceName: cls.name,
      result: 'allow',
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({ classification: updated });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE,
    audit: { eventType: 'admin.classification.delete', action: 'delete', resourceType: 'classification', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const cls = await db.classification.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!cls) throw ApiError.notFound('classification_not_found', 'Classification not found');
    if (cls.isSystem) throw ApiError.forbidden('system_locked', 'System classifications cannot be deleted');

    const inUse = await db.document.count({ where: { classificationId: cls.id, tenantId: ctx.tenantId } });
    if (inUse > 0) throw ApiError.conflict('in_use', `Classification is in use by ${inUse} documents`);

    await db.classification.delete({ where: { id: cls.id } });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.classification.delete',
      action: 'delete',
      resourceType: 'classification',
      resourceId: cls.id,
      resourceName: cls.name,
      result: 'allow',
      metadata: { code: cls.code },
    });

    return NextResponse.json({ ok: true });
  },
);
