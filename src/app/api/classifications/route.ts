/**
 * Smart EDMS — Classifications list (read-only, for end users)
 * GET /api/classifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx) => {
    const items = await db.classification.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { level: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        level: true,
        color: true,
        isSystem: true,
      },
    });
    return NextResponse.json({ items });
  },
);
