/**
 * Smart EDMS — Device detail (trust / revoke)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const PATCH = createApiHandler(
  {},
  async (req: NextRequest, ctx, params) => {
    const body = await req.json().catch(() => ({}));
    const device = await db.device.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!device) throw ApiError.notFound('not_found', 'Device not found');

    if (device.userId !== ctx.userId && !hasPermission(ctx.session.user.permissions, PERMISSIONS.ADMIN_USERS_MANAGE)) {
      throw ApiError.forbidden('not_authorized', 'Cannot modify other users\' devices');
    }

    const updated = await db.device.update({
      where: { id: device.id },
      data: {
        ...(body.trusted !== undefined ? { trusted: body.trusted } : {}),
        ...(body.label !== undefined ? { label: body.label } : {}),
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'device.update',
      action: 'update',
      resourceType: 'device',
      resourceId: device.id,
      resourceName: device.label,
      result: 'allow',
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({ device: updated });
  },
);

export const DELETE = createApiHandler(
  {},
  async (req: NextRequest, ctx, params) => {
    const device = await db.device.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!device) throw ApiError.notFound('not_found', 'Device not found');

    if (device.userId !== ctx.userId && !hasPermission(ctx.session.user.permissions, PERMISSIONS.ADMIN_USERS_MANAGE)) {
      throw ApiError.forbidden('not_authorized', 'Cannot revoke other users\' devices');
    }

    await db.device.delete({ where: { id: device.id } });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'device.revoked',
      action: 'delete',
      resourceType: 'device',
      resourceId: device.id,
      resourceName: device.label,
      result: 'allow',
    });

    return NextResponse.json({ ok: true });
  },
);
