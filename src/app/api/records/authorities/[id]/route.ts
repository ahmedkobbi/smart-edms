import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE },
  async (req, ctx, params) => {
    const authority = await db.dispositionAuthority.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
    });
    if (!authority) throw ApiError.notFound('authority_not_found', 'Disposition authority not found');
    return NextResponse.json({ authority });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    const authority = await db.dispositionAuthority.update({ where: { id: params!.id }, data: body });
    return NextResponse.json({ authority });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE },
  async (req, ctx, params) => {
    await db.dispositionAuthority.update({ where: { id: params!.id }, data: { status: 'retired' } });
    return NextResponse.json({ retired: true });
  },
);
