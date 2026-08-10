/**
 * Smart EDMS — API Key detail (revoke only)
 * DELETE /api/admin/api-keys/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_API_KEYS_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.apikey.revoke', action: 'delete', resourceType: 'api-key', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const key = await db.apiKey.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!key) throw ApiError.notFound('not_found', 'API key not found');

    await db.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  },
);
