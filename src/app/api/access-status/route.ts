import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { checkAccess, getDeploymentMode } from '@/lib/billing/access-gate';

// Returns the current subscription/license status for the banner UI.
// This endpoint bypasses the access gate (see isPlatformAdminEndpoint) so
// the banner can show even when the tenant is locked.
export const GET = createApiHandler(
  {},
  async (req, ctx) => {
    const access = await checkAccess(ctx.tenantId);

    return NextResponse.json({
      mode: getDeploymentMode(),
      level: access.level,
      status: access.status,
      message: access.message,
      gracePeriodEndsAt: access.gracePeriodEndsAt,
      dataExportDeadline: access.dataExportDeadline,
      plan: access.plan,
      seats: access.seats,
      storageBytes: access.storageBytes?.toString(),
    });
  },
);
