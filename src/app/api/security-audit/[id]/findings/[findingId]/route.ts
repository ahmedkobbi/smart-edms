import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { remediateFinding } from '@/lib/security/audit-framework';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx, params) => {
    const finding = await db.securityAuditFinding.findFirst({
      where: { id: params!.findingId, tenantId: ctx.targetTenantId },
    });
    if (!finding) throw ApiError.notFound('finding_not_found', 'Finding not found');
    return NextResponse.json({ finding });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();

    if (body.status === 'remediated') {
      const finding = await remediateFinding(
        params!.findingId,
        ctx.targetTenantId,
        ctx.userId,
        body.remediation || 'Remediated',
        body.verified || false,
      );
      return NextResponse.json({ finding });
    }

    const finding = await db.securityAuditFinding.update({
      where: { id: params!.findingId },
      data: body,
    });
    return NextResponse.json({ finding });
  },
);
