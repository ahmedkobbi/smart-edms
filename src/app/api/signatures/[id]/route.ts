import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getSignatureRequest } from '@/lib/signatures/signature-service';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SIGNATURE_READ },
  async (req, ctx, params) => {
    const request = await getSignatureRequest(params!.id, ctx.targetTenantId);
    if (!request) throw ApiError.notFound('signature_not_found', 'Signature request not found');
    return NextResponse.json({ request });
  },
);
