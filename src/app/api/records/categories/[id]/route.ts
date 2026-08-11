import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx, params) => {
    const category = await db.recordCategory.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
      include: { folders: true, children: true },
    });
    if (!category) throw ApiError.notFound('category_not_found', 'Record category not found');
    return NextResponse.json({ category });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    const category = await db.recordCategory.update({ where: { id: params!.id }, data: body });
    return NextResponse.json({ category });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx, params) => {
    await db.recordCategory.delete({ where: { id: params!.id } });
    return NextResponse.json({ deleted: true });
  },
);
