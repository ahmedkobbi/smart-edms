import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getRecordCategoryTree } from '@/lib/records/records-management';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx) => {
    const tree = await getRecordCategoryTree(ctx.targetTenantId);
    return NextResponse.json({ tree });
  },
);
