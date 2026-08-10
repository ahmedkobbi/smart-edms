/**
 * Smart EDMS — Dual control request
 * POST /api/admin/dual-control/route.ts (moved here for creation)
 * POST /api/admin/dual-control/:id/approve
 * POST /api/admin/dual-control/:id/reject
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { dualControlStore } from '../route';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    audit: { eventType: 'dual_control.decide', action: 'update', resourceType: 'dual_control', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = await req.json();
    const decision = body.decision as 'approve' | 'reject';

    const request = dualControlStore.get(params!.id);
    if (!request) throw ApiError.notFound('not_found', 'Dual-control request not found');
    if (request.tenantId !== ctx.tenantId) throw ApiError.forbidden('not_authorized', 'Wrong tenant');
    if (request.requestedById === ctx.userId) {
      throw ApiError.forbidden('cannot_self_approve', 'You cannot approve your own dual-control request');
    }
    if (request.status !== 'pending') {
      throw ApiError.badRequest('already_decided', `Request already ${request.status}`);
    }

    request.status = decision === 'approve' ? 'approved' : 'rejected';
    request.approvedById = ctx.userId;

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: `dual_control.${decision}d`,
      action: 'update',
      resourceType: 'dual_control',
      resourceId: request.id,
      result: 'allow',
      reason: body.reason || `Request ${decision}ed`,
      metadata: {
        originalAction: request.action,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        requestedBy: request.requestedById,
      },
    });

    return NextResponse.json({ request, canExecute: decision === 'approve' });
  },
);
