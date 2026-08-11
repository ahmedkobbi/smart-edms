import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getAuditWithFindings, updateAuditStatus, generateAuditReport } from '@/lib/security/audit-framework';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx, params) => {
    const audit = await getAuditWithFindings(params!.id, ctx.targetTenantId);
    if (!audit) throw ApiError.notFound('audit_not_found', 'Security audit not found');

    const url = new URL(req.url);
    if (url.searchParams.get('format') === 'report') {
      const report = await generateAuditReport(params!.id, ctx.targetTenantId);
      return new NextResponse(report, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="audit-report-${params!.id}.json"` } });
    }

    return NextResponse.json({ audit });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    const { status, ...rest } = body;

    const audit = await db.securityAudit.findFirst({ where: { id: params!.id, tenantId: ctx.targetTenantId } });
    if (!audit) throw ApiError.notFound('audit_not_found', 'Security audit not found');

    const updated = await db.securityAudit.update({
      where: { id: params!.id },
      data: { ...rest, ...(status ? { status } : {}) },
    });

    return NextResponse.json({ audit: updated });
  },
);
