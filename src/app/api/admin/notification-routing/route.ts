/**
 * Smart EDMS — Notification routing rules
 * GET  /api/admin/notification-routing            list all routes
 * POST /api/admin/notification-routing            create a route
 *
 * Routes determine HOW notifications are delivered based on severity +
 * type pattern. Example rules:
 *   - "Critical security → email all admins"
 *   - "Workflow reminders → in-app only"
 *   - "Policy violations → email + in-app security officers"
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.notificationRouting.findMany({
      where: { tenantId: ctx.targetTenantId },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
    return NextResponse.json({
      items: items.map((r) => ({
        ...r,
        channels: JSON.parse(r.channels || '["in_app"]'),
        targetRoles: JSON.parse(r.targetRoles || '[]'),
      })),
    });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  minSeverity: z.enum(['info', 'success', 'warning', 'critical']).default('warning'),
  typePattern: z.string().min(1).max(100).default('*'),
  channels: z.array(z.enum(['in_app', 'email', 'webhook'])).default(['in_app']),
  targetRoles: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(100),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.notification_routing.create', action: 'create', resourceType: 'notification_routing', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());
    const existing = await db.notificationRouting.findFirst({ where: { name: body.name, tenantId: ctx.targetTenantId } });
    if (existing) throw ApiError.conflict('exists', 'Routing rule with this name already exists');

    const route = await db.notificationRouting.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        minSeverity: body.minSeverity,
        typePattern: body.typePattern,
        channels: JSON.stringify(body.channels),
        targetRoles: JSON.stringify(body.targetRoles),
        enabled: body.enabled,
        priority: body.priority,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.notification_routing.create',
      action: 'create',
      resourceType: 'notification_routing',
      resourceId: route.id,
      resourceName: route.name,
      result: 'allow',
      metadata: { minSeverity: route.minSeverity, typePattern: route.typePattern, channels: body.channels },
    });

    return NextResponse.json({ route: { ...route, channels: body.channels, targetRoles: body.targetRoles } }, { status: 201 });
  },
);
