import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { verifyVitalRecordBackup } from '@/lib/records/records-management';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE },
  async (req, ctx, params) => {
    const vital = await db.vitalRecord.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
      include: { document: true },
    });
    if (!vital) throw ApiError.notFound('vital_not_found', 'Vital record not found');
    return NextResponse.json({ vital });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    if (body.verifyBackup) {
      const vital = await verifyVitalRecordBackup(params!.id, ctx.targetTenantId, ctx.userId);
      return NextResponse.json({ vital });
    }
    const vital = await db.vitalRecord.update({ where: { id: params!.id }, data: body });
    return NextResponse.json({ vital });
  },
);
