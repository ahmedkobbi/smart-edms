import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { runFullScan, runNpmAuditScan, runSecretScan, runConfigScan } from '@/lib/security/audit-framework';

const scanSchema = z.object({
  scanType: z.enum(['full', 'dependency', 'secret', 'config']).default('full'),
  auditId: z.string().optional(),
});

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_SCAN_RUN, rateLimit: { max: 3, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = scanSchema.parse(await req.json());

    let results;
    if (body.scanType === 'full') {
      results = await runFullScan(ctx.targetTenantId, body.auditId);
    } else if (body.scanType === 'dependency') {
      results = [await runNpmAuditScan(ctx.targetTenantId)];
    } else if (body.scanType === 'secret') {
      results = [await runSecretScan(ctx.targetTenantId)];
    } else {
      results = [await runConfigScan(ctx.targetTenantId)];
    }

    return NextResponse.json({ results }, { status: 201 });
  },
);

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx) => {
    const { db } = await import('@/lib/db');
    const scans = await db.securityScanResult.findMany({
      where: { tenantId: ctx.targetTenantId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ items: scans, total: scans.length });
  },
);
