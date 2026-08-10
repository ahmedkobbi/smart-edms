/**
 * Smart EDMS — Tenant settings
 * GET  /api/admin/tenant
 * PATCH /api/admin/tenant   { settings }
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
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, slug: true, status: true, settings: true, createdAt: true },
    });
    return NextResponse.json({
      tenant: { ...tenant, settings: JSON.parse(tenant?.settings || '{}') },
    });
  },
);

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.tenant.update', action: 'update', resourceType: 'tenant', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = patchSchema.parse(await req.json());

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.settings !== undefined) {
      // Merge settings
      const current = await db.tenant.findUnique({ where: { id: ctx.tenantId }, select: { settings: true } });
      const currentSettings = JSON.parse(current?.settings || '{}');
      updates.settings = JSON.stringify({ ...currentSettings, ...body.settings });
    }

    const tenant = await db.tenant.update({
      where: { id: ctx.tenantId },
      data: updates,
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.tenant.updated',
      action: 'update',
      resourceType: 'tenant',
      resourceId: ctx.tenantId,
      resourceName: tenant.name,
      result: 'allow',
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({
      tenant: { ...tenant, settings: JSON.parse(tenant.settings || '{}') },
    });
  },
);
