import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { terminateBpmnInstance } from '@/lib/bpmn/bpmn-engine';

const schema = z.object({ reason: z.string().min(3) });

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_INSTANCE_MANAGE, requireStepUp: true },
  async (req, ctx, params) => {
    const body = schema.parse(await req.json());
    const instance = await terminateBpmnInstance(params!.id, ctx.targetTenantId, ctx.userId, body.reason);
    return NextResponse.json({ instance });
  },
);
