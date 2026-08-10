/**
 * Smart EDMS — Admin roles
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_ROLES_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.role.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { isSystem: 'desc' },
      include: { _count: { select: { assignments: true } } },
    });
    return NextResponse.json({
      items: items.map((r) => ({ ...r, permissions: JSON.parse(r.permissions || '[]') })),
    });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).default([]),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_ROLES_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.role.create', action: 'create', resourceType: 'role', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());
    const existing = await db.role.findFirst({ where: { name: body.name, tenantId: ctx.tenantId } });
    if (existing) throw ApiError.conflict('exists', 'Role with this name already exists');

    const role = await db.role.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        description: body.description,
        permissions: JSON.stringify(body.permissions),
        isSystem: false,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.role.create',
      action: 'create',
      resourceType: 'role',
      resourceId: role.id,
      resourceName: role.name,
      result: 'allow',
      metadata: { permissions: body.permissions },
    });

    return NextResponse.json({ role: { ...role, permissions: body.permissions } }, { status: 201 });
  },
);
