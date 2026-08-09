/**
 * Smart EDMS — Workflow detail
 * GET /api/workflows/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.WORKFLOW_APPROVE },
  async (req: NextRequest, ctx, params) => {
    const wf = await db.workflow.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
      include: {
        document: { include: { classification: true } },
        initiator: { select: { id: true, name: true, email: true } },
        approvals: {
          include: {
            approver: { select: { id: true, name: true, email: true } },
            delegations: { include: { fromUser: { select: { id: true, name: true } }, toUser: { select: { id: true, name: true } } } },
          },
          orderBy: { stepIndex: 'asc' },
        },
      },
    });
    if (!wf) throw ApiError.notFound('not_found', 'Workflow not found');
    return NextResponse.json({ workflow: wf });
  },
);
