/**
 * Smart EDMS — Tenant lifecycle management (platform admin)
 *
 * GET   /api/admin/tenants/:id   get tenant details (platform admin)
 * PATCH /api/admin/tenants/:id   suspend / activate / update plan (platform admin + step-up)
 * DELETE /api/admin/tenants/:id  soft-delete tenant (platform admin + step-up)
 *
 * Platform admin only — requires ADMIN_PLATFORM_TENANT_MANAGE permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { revokeAllUserSessions } from '@/lib/auth/session-revocation';
import { z } from 'zod';

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_PLATFORM_VIEW_ALL,
  },
  async (req: NextRequest, ctx, params) => {
    const tenant = await db.tenant.findUnique({
      where: { id: params!.id },
      select: {
        id: true, name: true, slug: true, status: true, createdAt: true, updatedAt: true, settings: true,
        _count: { select: { users: true, documents: true, auditEvents: true, folders: true } },
        subscription: {
          select: { plan: true, status: true, seats: true, storageBytes: true, currentPeriodStart: true, currentPeriodEnd: true },
        },
      },
    });
    if (!tenant) throw ApiError.notFound('tenant_not_found', 'Tenant not found');

    // Compute storage usage
    const storageAgg = await db.documentVersion.aggregate({
      where: { tenantId: tenant.id },
      _sum: { sizeBytes: true },
    });

    return NextResponse.json({
      tenant: {
        ...tenant,
        subscription: tenant.subscription ? {
          ...tenant.subscription,
          storageBytes: Number(tenant.subscription.storageBytes),
        } : null,
        storageUsedBytes: Number(storageAgg._sum.sizeBytes ?? 0),
      },
    });
  },
);

const patchSchema = z.object({
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  plan: z.enum(['trial', 'starter', 'business', 'enterprise']).optional(),
  seats: z.number().int().min(1).max(10000).optional(),
  storageBytes: z.number().int().min(1024 * 1024).max(10 * 1024 * 1024 * 1024 * 1024).optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_PLATFORM_TENANT_MANAGE,
    requireStepUp: true,
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'admin.tenant.update', action: 'update', resourceType: 'tenant', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());

    const tenant = await db.tenant.findUnique({ where: { id: params!.id } });
    if (!tenant) throw ApiError.notFound('tenant_not_found', 'Tenant not found');

    // Update tenant status
    if (body.status !== undefined && body.status !== tenant.status) {
      await db.tenant.update({
        where: { id: tenant.id },
        data: { status: body.status },
      });

      // If suspending, revoke all sessions for all users in the tenant
      if (body.status === 'suspended') {
        const users = await db.user.findMany({
          where: { tenantId: tenant.id },
          select: { id: true },
        });
        for (const user of users) {
          await revokeAllUserSessions(user.id, 'tenant_suspended').catch(() => {});
        }
      }

      await recordAuditEvent({
        tenantId: tenant.id,
        actorId: ctx.userId,
        actorEmail: ctx.session.user.email,
        actorIp: ctx.ip,
        actorUserAgent: ctx.userAgent,
        correlationId: ctx.correlationId,
        eventType: `admin.tenant.${body.status}`,
        action: 'update',
        resourceType: 'tenant',
        resourceId: tenant.id,
        resourceName: tenant.name,
        result: 'allow',
        metadata: { previousStatus: tenant.status, newStatus: body.status },
      });
    }

    // Update subscription plan / seats / storage
    if (body.plan !== undefined || body.seats !== undefined || body.storageBytes !== undefined) {
      const sub = await db.subscription.findUnique({ where: { tenantId: tenant.id } });
      if (sub) {
        await db.subscription.update({
          where: { tenantId: tenant.id },
          data: {
            ...(body.plan !== undefined ? { plan: body.plan } : {}),
            ...(body.seats !== undefined ? { seats: body.seats } : {}),
            ...(body.storageBytes !== undefined ? { storageBytes: BigInt(body.storageBytes) } : {}),
          },
        });
      }
    }

    const updated = await db.tenant.findUnique({
      where: { id: tenant.id },
      include: { subscription: true },
    });

    return NextResponse.json({ tenant: updated });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_PLATFORM_TENANT_MANAGE,
    requireStepUp: true,
    rateLimit: { max: 3, windowMs: 60_000 },
    audit: { eventType: 'admin.tenant.delete', action: 'delete', resourceType: 'tenant', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const tenant = await db.tenant.findUnique({ where: { id: params!.id } });
    if (!tenant) throw ApiError.notFound('tenant_not_found', 'Tenant not found');

    // Prevent self-deletion
    if (tenant.id === ctx.tenantId) {
      throw ApiError.badRequest('cannot_delete_own_tenant', 'You cannot delete the tenant you are currently signed in to');
    }

    // Soft-delete: set status to 'deleted' (cascade deletes are handled by Prisma onDelete: Cascade)
    await db.tenant.update({
      where: { id: tenant.id },
      data: { status: 'deleted' },
    });

    // Revoke all sessions for all users in the deleted tenant
    const users = await db.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    for (const user of users) {
      await revokeAllUserSessions(user.id, 'tenant_deleted').catch(() => {});
    }

    await recordAuditEvent({
      tenantId: tenant.id,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.tenant.deleted',
      action: 'delete',
      resourceType: 'tenant',
      resourceId: tenant.id,
      resourceName: tenant.name,
      result: 'allow',
      metadata: { deletedTenantSlug: tenant.slug },
    });

    return NextResponse.json({ ok: true });
  },
);
