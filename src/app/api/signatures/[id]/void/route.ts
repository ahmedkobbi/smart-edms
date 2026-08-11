import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { voidSignatureRequest } from '@/lib/signatures/signature-service';

const voidSchema = z.object({ reason: z.string().min(3) });

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SIGNATURE_VOID, requireStepUp: true },
  async (req, ctx, params) => {
    const body = voidSchema.parse(await req.json());
    const request = await voidSignatureRequest(params!.id, ctx.targetTenantId, ctx.userId, body.reason);
    return NextResponse.json({ request });
  },
);
