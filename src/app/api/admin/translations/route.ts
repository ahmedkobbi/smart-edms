/**
 * Smart EDMS — Translation management API
 * GET  /api/admin/translations              list all translation entries
 * POST /api/admin/translations              create/update a translation
 * PATCH /api/admin/translations/:id         update a translation
 * DELETE /api/admin/translations/:id        delete a translation
 * POST /api/admin/translations/:id/approve  approve a translation
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_VIEW },
  async (req: NextRequest, ctx) => {
    const locale = req.nextUrl.searchParams.get('locale');
    const namespace = req.nextUrl.searchParams.get('namespace');
    const reviewStatus = req.nextUrl.searchParams.get('reviewStatus');

    const items = await db.localeResource.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(locale ? { locale } : {}),
        ...(namespace ? { namespace } : {}),
        ...(reviewStatus ? { reviewStatus } : {}),
      },
      orderBy: [{ locale: 'asc' }, { namespace: 'asc' }, { key: 'asc' }],
      take: 500,
    });

    return NextResponse.json({ items });
  },
);

const upsertSchema = z.object({
  locale: z.enum(['en', 'fr', 'ar', 'es', 'de']),
  namespace: z.string().min(1).max(50),
  key: z.string().min(1).max(200),
  value: z.string().min(1).max(5000),
  reviewStatus: z.enum(['draft', 'reviewed', 'approved']).default('draft'),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.translation.update', action: 'update', resourceType: 'translation', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = upsertSchema.parse(await req.json());

    // Upsert by (tenantId, locale, namespace, key)
    const existing = await db.localeResource.findFirst({
      where: {
        tenantId: ctx.tenantId,
        locale: body.locale,
        namespace: body.namespace,
        key: body.key,
      },
    });

    let entry;
    if (existing) {
      entry = await db.localeResource.update({
        where: { id: existing.id },
        data: {
          value: body.value,
          reviewStatus: body.reviewStatus,
          updatedBy: ctx.userId,
        },
      });
    } else {
      entry = await db.localeResource.create({
        data: {
          tenantId: ctx.tenantId,
          locale: body.locale,
          namespace: body.namespace,
          key: body.key,
          value: body.value,
          reviewStatus: body.reviewStatus,
          updatedBy: ctx.userId,
        },
      });
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.translation.update',
      action: 'upsert',
      resourceType: 'translation',
      resourceId: entry.id,
      resourceName: `${entry.locale}.${entry.namespace}.${entry.key}`,
      result: 'allow',
      metadata: { locale: body.locale, namespace: body.namespace, key: body.key, reviewStatus: body.reviewStatus },
    });

    return NextResponse.json({ entry }, { status: existing ? 200 : 201 });
  },
);
