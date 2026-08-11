import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { saveBpmnDefinition, listBpmnDefinitions } from '@/lib/bpmn/bpmn-engine';

const saveSchema = z.object({
  processKey: z.string().min(2).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  name: z.string().min(3),
  description: z.string().optional(),
  bpmnXml: z.string().min(50),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_VIEW },
  async (req, ctx) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') as any;
    const definitions = await listBpmnDefinitions(ctx.targetTenantId, status);
    return NextResponse.json({ items: definitions, total: definitions.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_MANAGE, rateLimit: { max: 20, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = saveSchema.parse(await req.json());
    const definition = await saveBpmnDefinition({
      tenantId: ctx.targetTenantId,
      ...body,
      createdBy: ctx.userId,
    });
    return NextResponse.json({ definition }, { status: 201 });
  },
);
