/**
 * Smart EDMS — Current user / session info
 * GET /api/me
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';

export const GET = createApiHandler(
  {},
  async (req: NextRequest, ctx) => {
    const user = await db.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: {
        id: true, email: true, name: true, status: true, mfaEnabled: true,
        jobTitle: true, department: true, avatarUrl: true,
        lastLoginAt: true, lastLoginIp: true, createdAt: true,
      },
    });

    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, slug: true, settings: true },
    });

    return NextResponse.json({
      user,
      tenant,
      session: ctx.session.user,
    });
  },
);
