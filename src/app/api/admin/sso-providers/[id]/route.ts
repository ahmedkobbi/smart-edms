/**
 * Smart EDMS — SSO Provider detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  // ... other fields
});

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_INTEGRATIONS_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const provider = await db.ssoProvider.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!provider) throw ApiError.notFound('not_found', 'SSO provider not found');

    let encryptedSecret = provider.clientSecretEnc;
    if (body.clientSecret !== undefined) {
      const { encryptString } = await import('@/lib/auth/crypto');
      encryptedSecret = body.clientSecret ? JSON.stringify(await encryptString(body.clientSecret)) : null;
    }

    const updated = await db.ssoProvider.update({
      where: { id: provider.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
        ...(body.clientSecret !== undefined ? { clientSecretEnc: encryptedSecret } : {}),
      },
    });
    return NextResponse.json({ provider: { ...updated, clientSecretEnc: '***' } });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_INTEGRATIONS_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const provider = await db.ssoProvider.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!provider) throw ApiError.notFound('not_found', 'SSO provider not found');
    await db.ssoProvider.delete({ where: { id: provider.id } });
    return NextResponse.json({ ok: true });
  },
);
