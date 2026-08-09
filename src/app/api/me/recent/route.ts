/**
 * Smart EDMS — My recent views
 * GET /api/me/recent
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx) => {
    const recent = await db.recentView.findMany({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
      orderBy: { viewedAt: 'desc' },
      take: 20,
      include: {
        document: {
          select: {
            id: true, title: true, description: true, state: true, updatedAt: true,
            classification: { select: { code: true, name: true, color: true } },
          },
        },
      },
    });
    return NextResponse.json({
      items: recent.map((r) => ({
        ...r.document,
        viewedAt: r.viewedAt,
      })),
    });
  },
);
