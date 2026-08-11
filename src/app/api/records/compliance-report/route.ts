import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { generateComplianceReport } from '@/lib/records/records-management';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx) => {
    const report = await generateComplianceReport(ctx.targetTenantId);
    return NextResponse.json(report);
  },
);
