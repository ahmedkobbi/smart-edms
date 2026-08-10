/**
 * Smart EDMS — Recertification item detail
 * GET /api/admin/recertification/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  {
    // SECURITY FIX (M-ADM-13): Recertification item detail returns the
    // target user's email + role list — sensitive PII. Previously the route
    // had EMPTY options (no requiredPermission) and only filtered by
    // tenantId, so any authenticated user could enumerate recertification
    // item IDs and read other users' role memberships. Restrict to admins
    // OR the assigned reviewer.
    requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE,
  },
  async (req: NextRequest, ctx, params) => {
    const item = await db.recertificationItem.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
      include: {
        campaign: true,
        user: { select: { id: true, name: true, email: true, status: true, roleAssignments: { include: { role: true } } } },
      },
    });
    if (!item) throw ApiError.notFound('not_found', 'Item not found');

    // Non-admins can only see items where they are the assigned reviewer.
    // (Admins already passed the requiredPermission check above.)
    if (item.reviewerId !== ctx.userId) {
      throw ApiError.notFound('not_found', 'Item not found');
    }

    return NextResponse.json({ item });
  },
);
