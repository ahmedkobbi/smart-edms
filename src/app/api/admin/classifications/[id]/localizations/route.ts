/**
 * Smart EDMS — Classification localizations list
 * GET /api/admin/classifications/:id/localizations
 *
 * Returns all locale overrides for a classification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const cls = await db.classification.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!cls) throw ApiError.notFound('classification_not_found', 'Classification not found');

    const localizations = await db.classificationLocalization.findMany({
      where: { classificationId: cls.id, tenantId: ctx.tenantId },
      orderBy: { locale: 'asc' },
    });

    return NextResponse.json({ items: localizations });
  },
);
