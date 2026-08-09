/**
 * Smart EDMS — Device trust API
 * GET  /api/admin/devices         list devices (admin: all; user: own)
 * POST /api/admin/devices/:id/trust    mark device trusted
 * DELETE /api/admin/devices/:id    revoke device
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { sha256 } from '@/lib/auth/crypto';

export const GET = createApiHandler(
  {},
  async (req: NextRequest, ctx) => {
    const userId = req.nextUrl.searchParams.get('userId') || ctx.userId;
    const isAdmin = hasPermission(ctx.session.user.permissions, PERMISSIONS.ADMIN_USERS_MANAGE);
    if (userId !== ctx.userId && !isAdmin) {
      throw ApiError.forbidden('not_authorized', 'Cannot view other users\' devices');
    }
    const items = await db.device.findMany({
      where: { tenantId: ctx.tenantId, userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return NextResponse.json({ items });
  },
);
