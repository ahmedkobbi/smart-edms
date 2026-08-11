/**
 * Smart EDMS — Notification routing rule detail
 * PATCH  /api/admin/notification-routing/:id   update a route
 * DELETE /api/admin/notification-routing/:id   delete a route
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  minSeverity: z.enum(['info', 'success', 'warning', 'critical']).optional(),
  typePattern: z.string().min(1).max(100).optional(),
  channels: z.array(z.enum(['in_app', 'email', 'webhook'])).optional(),
  targetRoles: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.notification_routing.update', action: 'update', resourceType: 'notification_routing', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const route = await db.notificationRouting.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!route) throw ApiError.notFound('not_found', 'Routing rule not found');

    const updated = await db.notificationRouting.update({
      where: { id: route.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.minSeverity !== undefined ? { minSeverity: body.minSeverity } : {}),
        ...(body.typePattern !== undefined ? { typePattern: body.typePattern } : {}),
        ...(body.channels !== undefined ? { channels: JSON.stringify(body.channels) } : {}),
        ...(body.targetRoles !== undefined ? { targetRoles: JSON.stringify(body.targetRoles) } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.notification_routing.update',
      action: 'update',
      resourceType: 'notification_routing',
      resourceId: route.id,
      resourceName: route.name,
      result: 'allow',
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({ route: { ...updated, channels: JSON.parse(updated.channels), targetRoles: JSON.parse(updated.targetRoles) } });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.notification_routing.delete', action: 'delete', resourceType: 'notification_routing', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const route = await db.notificationRouting.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!route) throw ApiError.notFound('not_found', 'Routing rule not found');

    await db.notificationRouting.delete({ where: { id: route.id } });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.notification_routing.delete',
      action: 'delete',
      resourceType: 'notification_routing',
      resourceId: route.id,
      resourceName: route.name,
      result: 'allow',
    });

    return NextResponse.json({ ok: true });
  },
);
