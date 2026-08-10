/**
 * Smart EDMS — Security anomalies
 * GET  /api/admin/anomalies
 * POST /api/admin/anomalies/:id/resolve   { notes }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { detectAnomalies } from '@/lib/security/anomaly-detector';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_VIEW },
  async (req: NextRequest, ctx) => {
    // Run detection first (idempotent — only creates new anomalies)
    await detectAnomalies(ctx.tenantId);

    const items = await db.securityAnomaly.findMany({
      where: { tenantId: ctx.tenantId, resolved: false },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ items });
  },
);

export const POST = createApiHandler(
  {
    requireStepUp: true, requiredPermission: PERMISSIONS.ADMIN_VIEW },
  async (req: NextRequest, ctx, params) => {
    const body = await req.json().catch(() => ({}));
    const anomaly = await db.securityAnomaly.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!anomaly) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });

    const updated = await db.securityAnomaly.update({
      where: { id: anomaly.id },
      data: { resolved: true, resolvedBy: ctx.userId, resolvedAt: new Date() },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'anomaly.resolved',
      action: 'update',
      resourceType: 'anomaly',
      resourceId: anomaly.id,
      result: 'allow',
      metadata: { type: anomaly.type, notes: body.notes },
    });

    return NextResponse.json({ anomaly: updated });
  },
);
