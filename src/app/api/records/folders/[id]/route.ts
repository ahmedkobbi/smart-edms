import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE },
  async (req, ctx, params) => {
    const folder = await db.recordFolder.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
      include: { category: true },
    });
    if (!folder) throw ApiError.notFound('folder_not_found', 'Record folder not found');
    return NextResponse.json({ folder });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    const folder = await db.recordFolder.update({ where: { id: params!.id }, data: body });
    return NextResponse.json({ folder });
  },
);
