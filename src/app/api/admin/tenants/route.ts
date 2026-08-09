/**
 * Smart EDMS — Tenant management (multi-tenant onboarding)
 *
 * GET  /api/admin/tenants         list tenants (platform-level; restricted)
 * POST /api/admin/tenants         create new tenant
 *
 * In SaaS mode, this would be called by a platform operator.
 * In single-tenant mode, only the existing tenant is visible.
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
    // In production, this would be a platform-admin only call.
    // For now, return only the current tenant.
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, slug: true, status: true, createdAt: true, settings: true },
    });
    return NextResponse.json({
      items: [tenant],
      note: 'Multi-tenant listing requires platform-admin elevation.',
    });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(200),
  adminPassword: z.string().min(12),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    audit: { eventType: 'admin.tenant.create', action: 'create', resourceType: 'tenant', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const existing = await db.tenant.findUnique({ where: { slug: body.slug } });
    if (existing) throw ApiError.conflict('slug_exists', 'Tenant with this slug already exists');

    const { hashPassword } = await import('@/lib/auth/crypto');
    const { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } = await import('@/lib/auth/permissions');

    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.name,
          slug: body.slug,
          status: 'active',
          settings: JSON.stringify({
            branding: { primary: '#0f172a', accent: '#0ea5e9' },
            features: { ai: true, watermark: true, ocr: true },
            residency: 'default',
          }),
        },
      });

      // Create system roles for the new tenant
      const roleIds: Record<string, string> = {};
      for (const [_, roleName] of Object.entries(SYSTEM_ROLES)) {
        const role = await tx.role.create({
          data: {
            tenantId: tenant.id,
            name: roleName,
            permissions: JSON.stringify(SYSTEM_ROLE_PERMISSIONS[roleName] ?? []),
            isSystem: true,
            description: `System role: ${roleName}`,
          },
        });
        roleIds[roleName] = role.id;
      }

      // Create default classifications
      const classifications = [
        { code: 'PUBLIC', name: 'Public', level: 0, color: '#16a34a' },
        { code: 'INTERNAL', name: 'Internal', level: 1, color: '#2563eb' },
        { code: 'CONFIDENTIAL', name: 'Confidential', level: 2, color: '#d97706' },
        { code: 'RESTRICTED', name: 'Restricted', level: 3, color: '#dc2626' },
        { code: 'HS', name: 'Highly Sensitive', level: 4, color: '#7c2d12' },
      ];
      for (const c of classifications) {
        await tx.classification.create({
          data: { ...c, tenantId: tenant.id, isSystem: true },
        });
      }

      // Create admin user
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: body.adminEmail.toLowerCase(),
          name: body.adminName,
          passwordHash: await hashPassword(body.adminPassword),
          status: 'active',
        },
      });

      await tx.roleAssignment.create({
        data: {
          tenantId: tenant.id,
          userId: admin.id,
          roleId: roleIds[SYSTEM_ROLES.TENANT_ADMIN],
          scope: '',
        },
      });

      // Create trial subscription
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: 'trial',
          status: 'trialing',
          seats: 5,
          storageBytes: 5 * 1024 * 1024 * 1024, // 5GB as BigInt
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600_000),
        },
      });

      return { tenant, admin };
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.tenant.created',
      action: 'create',
      resourceType: 'tenant',
      resourceId: result.tenant.id,
      resourceName: result.tenant.name,
      result: 'allow',
      metadata: {
        newTenantSlug: result.tenant.slug,
        adminEmail: result.admin.email,
      },
    });

    return NextResponse.json({
      tenant: result.tenant,
      adminEmail: result.admin.email,
      message: 'Tenant created with default roles, classifications, and trial subscription.',
    }, { status: 201 });
  },
);
