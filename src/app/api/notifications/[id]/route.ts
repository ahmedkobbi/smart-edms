/**
 * Smart EDMS — Notification detail
 * PATCH /api/notifications/:id   { read: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

const schema = z.object({ read: z.boolean() });

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.NOTIFICATION_READ },
  async (req: NextRequest, ctx, params) => {
    const body = schema.parse(await req.json());
    const n = await db.notification.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId, userId: ctx.userId } });
    if (!n) throw ApiError.notFound('not_found', 'Notification not found');
    const updated = await db.notification.update({
      where: { id: n.id },
      data: { readAt: body.read ? new Date() : null },
    });
    return NextResponse.json({ notification: updated });
  },
);
