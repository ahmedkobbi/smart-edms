/**
 * Smart EDMS — Service Account revoke
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_API_KEYS_MANAGE,
    audit: { eventType: 'admin.service-account.revoke', action: 'delete', resourceType: 'service-account', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const sa = await db.serviceAccount.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!sa) throw ApiError.notFound('not_found', 'Service account not found');
    await db.serviceAccount.update({
      where: { id: sa.id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  },
);
