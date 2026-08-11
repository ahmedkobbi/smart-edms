/**
 * Smart EDMS — Translation entry detail
 * PATCH  /api/admin/translations/:id   update value or review status
 * DELETE /api/admin/translations/:id   delete
 * POST   /api/admin/translations/:id/approve  approve
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const patchSchema = z.object({
  value: z.string().max(5000).optional(),
  reviewStatus: z.enum(['draft', 'reviewed', 'approved']).optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.translation.update', action: 'update', resourceType: 'translation', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const entry = await db.localeResource.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!entry) throw ApiError.notFound('not_found', 'Translation entry not found');

    const updated = await db.localeResource.update({
      where: { id: entry.id },
      data: {
        ...(body.value !== undefined ? { value: body.value } : {}),
        ...(body.reviewStatus !== undefined ? { reviewStatus: body.reviewStatus } : {}),
        updatedBy: ctx.userId,
      },
    });

    return NextResponse.json({ entry: updated });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.translation.delete', action: 'delete', resourceType: 'translation', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const entry = await db.localeResource.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!entry) throw ApiError.notFound('not_found', 'Translation entry not found');

    await db.localeResource.delete({ where: { id: entry.id } });

    return NextResponse.json({ ok: true });
  },
);
