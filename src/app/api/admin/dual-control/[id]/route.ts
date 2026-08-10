/**
 * Smart EDMS — Dual-control decision + execution
 * POST /api/admin/dual-control/:id   { decision: 'approve' | 'reject', reason }
 *
 * Rules:
 *   - Approver CANNOT be the same user who requested (separation of duties)
 *   - Approver must have ADMIN_TENANT_MANAGE permission
 *   - Request must be `pending` and not expired
 *   - On approve: status → 'approved'; requester can then execute
 *   - On reject: status → 'rejected'; request is closed
 *
 * Execution (applying the approved action) is a separate concern — it
 * is performed by the requester via a dedicated executor endpoint,
 * not here. This route ONLY records the approver's decision.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().min(3).max(500).optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'dual_control.decide', action: 'update', resourceType: 'dual_control', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = decideSchema.parse(await req.json());

    const request = await db.dualControlRequest.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!request) throw ApiError.notFound('not_found', 'Dual-control request not found');

    if (request.requestedById === ctx.userId) {
      throw ApiError.forbidden('cannot_self_approve', 'You cannot approve your own dual-control request — separation of duties requires a different administrator');
    }
    if (request.status !== 'pending') {
      throw ApiError.badRequest('already_decided', `Request already ${request.status}`);
    }
    if (request.expiresAt < new Date()) {
      await db.dualControlRequest.update({
        where: { id: request.id },
        data: { status: 'expired' },
      });
      throw ApiError.badRequest('expired', 'This dual-control request has expired');
    }

    const newStatus = body.decision === 'approve' ? 'approved' : 'rejected';
    await db.dualControlRequest.update({
      where: { id: request.id },
      data: {
        status: newStatus,
        approvedById: ctx.userId,
        decisionAt: new Date(),
        decisionReason: body.reason || null,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: `dual_control.${body.decision}d`,
      action: 'update',
      resourceType: 'dual_control',
      resourceId: request.id,
      result: 'allow',
      reason: body.reason || `Request ${body.decision}ed`,
      metadata: {
        originalAction: request.action,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        requestedById: request.requestedById,
        decision: body.decision,
      },
    });

    return NextResponse.json({
      request: {
        ...request,
        status: newStatus,
        approvedById: ctx.userId,
        decisionAt: new Date(),
        decisionReason: body.reason || null,
      },
      canExecute: body.decision === 'approve',
    });
  },
);
