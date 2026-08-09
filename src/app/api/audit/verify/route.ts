/**
 * Smart EDMS — Audit chain integrity verification
 * GET /api/audit/verify
 *
 * Walks the per-tenant audit chain and reports any broken hash links.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { verifyAuditChain } from '@/lib/audit/audit-service';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AUDIT_VERIFY_INTEGRITY,
    audit: { eventType: 'audit.verify', action: 'read', resourceType: 'audit', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10_000;

    const result = await verifyAuditChain(ctx.tenantId, { limit });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'audit.verify.result',
      action: 'read',
      resourceType: 'audit',
      result: result.ok ? 'allow' : 'error',
      metadata: {
        verifiedCount: result.verifiedCount,
        ok: result.ok,
        brokenAt: result.brokenAt ?? null,
      },
    });

    return NextResponse.json(result);
  },
);
