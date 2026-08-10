/**
 * Smart EDMS — My favorites
 * GET /api/me/favorites
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx) => {
    const favorites = await db.favorite.findMany({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        document: {
          select: {
            id: true, title: true, description: true, state: true, updatedAt: true,
            classification: { select: { code: true, name: true, color: true } },
          },
        },
      },
      take: 100,
    });
    return NextResponse.json({ items: favorites.map((f) => f.document) });
  },
);
