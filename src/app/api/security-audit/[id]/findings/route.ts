import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createFinding } from '@/lib/security/audit-framework';
import { db } from '@/lib/db';

const createFindingSchema = z.object({
  findingId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().min(10),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'informational']).default('medium'),
  cvssScore: z.number().min(0).max(10).optional(),
  cvssVector: z.string().optional(),
  affectedComponent: z.string().optional(),
  cweId: z.string().optional(),
  remediation: z.string().optional(),
  evidence: z.array(z.object({ type: z.string(), path: z.string(), hash: z.string().optional() })).optional(),
  controlRefs: z.record(z.string(), z.array(z.string())).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx, params) => {
    const findings = await db.securityAuditFinding.findMany({
      where: { auditId: params!.id, tenantId: ctx.targetTenantId },
      orderBy: { severity: 'asc' },
    });
    return NextResponse.json({ items: findings, total: findings.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE, rateLimit: { max: 30, windowMs: 60_000 } },
  async (req, ctx, params) => {
    const body = createFindingSchema.parse(await req.json());
    const finding = await createFinding({
      tenantId: ctx.targetTenantId,
      auditId: params!.id,
      findingId: body.findingId,
      title: body.title,
      description: body.description,
      severity: body.severity,
      cvssScore: body.cvssScore,
      cvssVector: body.cvssVector,
      affectedComponent: body.affectedComponent,
      cweId: body.cweId,
      remediation: body.remediation,
      evidence: body.evidence,
      controlRefs: body.controlRefs,
      assignedTo: body.assignedTo,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    } as any);
    return NextResponse.json({ finding }, { status: 201 });
  },
);
