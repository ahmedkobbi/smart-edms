import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { startBpmnInstance } from '@/lib/bpmn/bpmn-engine';
import { db } from '@/lib/db';

const startSchema = z.object({ documentId: z.string().optional() });

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_VIEW },
  async (req, ctx, params) => {
    const instances = await db.bpmnProcessInstance.findMany({
      where: { definitionId: params!.id, tenantId: ctx.targetTenantId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ items: instances, total: instances.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_INSTANCE_MANAGE },
  async (req, ctx, params) => {
    const body = startSchema.parse(await req.json());
    const instance = await startBpmnInstance(params!.id, ctx.targetTenantId, body.documentId, ctx.userId);
    return NextResponse.json({ instance }, { status: 201 });
  },
);
