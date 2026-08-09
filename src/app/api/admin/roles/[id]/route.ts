/**
 * Smart EDMS — Admin role detail
 * PATCH  /api/admin/roles/:id
 * DELETE /api/admin/roles/:id   (system roles cannot be deleted)
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
  permissions: z.array(z.string()).optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_ROLES_MANAGE,
    audit: { eventType: 'admin.role.update', action: 'update', resourceType: 'role', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const role = await db.role.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!role) throw ApiError.notFound('not_found', 'Role not found');

    const updated = await db.role.update({
      where: { id: role.id },
      data: {
        ...(body.name !== undefined && !role.isSystem ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.permissions !== undefined ? { permissions: JSON.stringify(body.permissions) } : {}),
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.role.update',
      action: 'update',
      resourceType: 'role',
      resourceId: role.id,
      resourceName: role.name,
      result: 'allow',
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({ role: { ...updated, permissions: JSON.parse(updated.permissions || '[]') } });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_ROLES_MANAGE,
    audit: { eventType: 'admin.role.delete', action: 'delete', resourceType: 'role', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const role = await db.role.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!role) throw ApiError.notFound('not_found', 'Role not found');
    if (role.isSystem) throw ApiError.forbidden('system_locked', 'System roles cannot be deleted');

    const inUse = await db.roleAssignment.count({ where: { roleId: role.id } });
    if (inUse > 0) throw ApiError.conflict('in_use', `Role is assigned to ${inUse} users`);

    await db.role.delete({ where: { id: role.id } });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.role.delete',
      action: 'delete',
      resourceType: 'role',
      resourceId: role.id,
      resourceName: role.name,
      result: 'allow',
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  },
);
