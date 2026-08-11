import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { cutoffFolder } from '@/lib/records/records-management';

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE, requireStepUp: true },
  async (req, ctx, params) => {
    const folder = await cutoffFolder(params!.id, ctx.targetTenantId, ctx.userId);
    return NextResponse.json({ folder });
  },
);
