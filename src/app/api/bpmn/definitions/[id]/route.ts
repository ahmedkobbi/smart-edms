import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getBpmnDefinition } from '@/lib/bpmn/bpmn-engine';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_VIEW },
  async (req, ctx, params) => {
    const definition = await getBpmnDefinition(params!.id, ctx.targetTenantId);
    if (!definition) throw ApiError.notFound('definition_not_found', 'BPMN definition not found');
    return NextResponse.json({ definition });
  },
);
