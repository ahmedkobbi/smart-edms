/**
 * Smart EDMS — Notifications
 * GET  /api/notifications          list unread + recent
 * POST /api/notifications/read-all mark all as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.NOTIFICATION_READ },
  async (req: NextRequest, ctx) => {
    const items = await db.notification.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = await db.notification.count({
      where: { tenantId: ctx.tenantId, userId: ctx.userId, readAt: null },
    });
    return NextResponse.json({ items, unreadCount });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.NOTIFICATION_READ },
  async (req: NextRequest, ctx) => {
    await db.notification.updateMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  },
);
