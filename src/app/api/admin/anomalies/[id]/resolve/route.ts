/**
 * Smart EDMS — Anomaly resolve
 * POST /api/admin/anomalies/:id/resolve   { notes }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const POST = createApiHandler(
  {
    requireStepUp: true, requiredPermission: PERMISSIONS.ADMIN_VIEW },
  async (req: NextRequest, ctx, params) => {
    const body = await req.json().catch(() => ({}));
    const anomaly = await db.securityAnomaly.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!anomaly) throw ApiError.notFound('not_found', 'Anomaly not found');

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
