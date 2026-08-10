/**
 * Smart EDMS — Push notification subscription API
 * POST   /api/push/subscribe    subscribe a browser
 * DELETE /api/push/subscribe    unsubscribe
 * GET    /api/push/vapid-public-key  get VAPID public key
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { subscribePush, unsubscribePush } from '@/lib/notifications/push';
import { z } from 'zod';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const POST = createApiHandler(
  {},
  async (req: NextRequest, ctx) => {
    const body = subscribeSchema.parse(await req.json());
    await subscribePush({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      endpoint: body.endpoint,
      keys: body.keys,
      userAgent: ctx.userAgent || undefined,
    });
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = createApiHandler(
  {},
  async (req: NextRequest, ctx) => {
    const body = await req.json().catch(() => ({}));
    if (body.endpoint) {
      // SECURITY FIX (M-ADM-8): Pass userId + tenantId so the unsubscribe is
      // scoped to the caller's own subscriptions.
      await unsubscribePush(body.endpoint, ctx.userId, ctx.tenantId);
    } else {
      // Unsubscribe all for this user
      const { db } = await import('@/lib/db');
      await db.pushSubscription.deleteMany({ where: { userId: ctx.userId, tenantId: ctx.tenantId } });
    }
    return NextResponse.json({ ok: true });
  },
);
