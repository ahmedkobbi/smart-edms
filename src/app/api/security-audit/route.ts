import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createSecurityAudit, COMPLIANCE_CONTROLS } from '@/lib/security/audit-framework';
import { db } from '@/lib/db';

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  framework: z.enum(['iso27001', 'soc2', 'gdpr', 'hipaa', 'dod501502', 'internal']).default('internal'),
  scope: z.enum(['full', 'auth', 'documents', 'billing', 'infrastructure', 'api']).default('full'),
  auditorName: z.string().optional(),
  auditorEmail: z.string().email().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ, rateLimit: { max: 30, windowMs: 60_000 } },
  async (req, ctx) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const framework = url.searchParams.get('framework');

    const where: Record<string, unknown> = { tenantId: ctx.targetTenantId };
    if (status) where.status = status;
    if (framework) where.framework = framework;

    const [total, items] = await Promise.all([
      db.securityAudit.count({ where }),
      db.securityAudit.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);

    return NextResponse.json({ items, total });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE, rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'security.audit.create', action: 'create', resourceType: 'security_audit', alwaysAudit: true } },
  async (req, ctx) => {
    const body = createSchema.parse(await req.json());
    const audit = await createSecurityAudit({
      tenantId: ctx.targetTenantId,
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      initiatedBy: ctx.userId,
    });
    return NextResponse.json({ audit }, { status: 201 });
  },
);

export const OPTIONS = async () => {
  return NextResponse.json({ frameworks: Object.keys(COMPLIANCE_CONTROLS), controls: COMPLIANCE_CONTROLS });
};
