import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { disposeFolder } from '@/lib/records/records-management';

const schema = z.object({
  method: z.enum(['destroyed', 'transferred']),
  notes: z.string().optional(),
});

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_APPROVE, requireStepUp: true },
  async (req, ctx, params) => {
    const body = schema.parse(await req.json());
    const folder = await disposeFolder(params!.id, ctx.targetTenantId, ctx.userId, body.method, body.notes);
    return NextResponse.json({ folder });
  },
);
