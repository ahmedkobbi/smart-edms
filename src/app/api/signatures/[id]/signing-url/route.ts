import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { getSigningUrl } from '@/lib/signatures/signature-service';

const schema = z.object({ email: z.string().email() });

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SIGNATURE_READ },
  async (req, ctx, params) => {
    const body = schema.parse(await req.json());
    const url = await getSigningUrl(params!.id, ctx.targetTenantId, body.email);
    return NextResponse.json({ url });
  },
);
