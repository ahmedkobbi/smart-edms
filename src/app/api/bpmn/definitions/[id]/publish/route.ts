import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { publishBpmnDefinition } from '@/lib/bpmn/bpmn-engine';

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_MANAGE, requireStepUp: true },
  async (req, ctx, params) => {
    const definition = await publishBpmnDefinition(params!.id, ctx.targetTenantId, ctx.userId);
    return NextResponse.json({ definition });
  },
);
