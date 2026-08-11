import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { getDefaultBpmnTemplate } from '@/lib/bpmn/bpmn-engine';

const schema = z.object({
  processKey: z.string().min(2),
  name: z.string().min(3),
});

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_VIEW },
  async (req, ctx) => {
    const body = schema.parse(await req.json());
    const xml = getDefaultBpmnTemplate(body.processKey, body.name);
    return NextResponse.json({ xml });
  },
);
