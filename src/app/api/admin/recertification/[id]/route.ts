/**
 * Smart EDMS — Recertification item detail
 * GET /api/admin/recertification/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';

export const GET = createApiHandler(
  {},
  async (req: NextRequest, ctx, params) => {
    const item = await db.recertificationItem.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
      include: {
        campaign: true,
        user: { select: { id: true, name: true, email: true, status: true, roleAssignments: { include: { role: true } } } },
      },
    });
    if (!item) throw ApiError.notFound('not_found', 'Item not found');
    return NextResponse.json({ item });
  },
);
