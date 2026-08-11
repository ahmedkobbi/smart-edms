import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { advanceBpmnInstance } from '@/lib/bpmn/bpmn-engine';

const schema = z.object({
  outcome: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
});

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_INSTANCE_MANAGE, requireStepUp: true },
  async (req, ctx, params) => {
    const body = schema.parse(await req.json());
    const instance = await advanceBpmnInstance(params!.id, ctx.targetTenantId, ctx.userId, body.outcome, body.comment);
    return NextResponse.json({ instance });
  },
);
