/**
 * Smart EDMS — Saved search detail
 * DELETE /api/saved-searches/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx, params) => {
    const ss = await db.savedSearch.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, userId: ctx.userId },
    });
    if (!ss) throw ApiError.notFound('not_found', 'Saved search not found');
    await db.savedSearch.delete({ where: { id: ss.id } });
    return NextResponse.json({ ok: true });
  },
);
