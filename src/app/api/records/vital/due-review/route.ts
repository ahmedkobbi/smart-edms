import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getVitalRecordsDueForReview } from '@/lib/records/records-management';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE },
  async (req, ctx) => {
    const records = await getVitalRecordsDueForReview(ctx.targetTenantId);
    return NextResponse.json({ items: records, total: records.length });
  },
);
