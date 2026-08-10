/**
 * Smart EDMS — Webhook detail
 * PATCH  /api/admin/webhooks/:id
 * DELETE /api/admin/webhooks/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = createApiHandler(
  {
    requireStepUp: true, requiredPermission: PERMISSIONS.ADMIN_WEBHOOKS_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const webhook = await db.webhook.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!webhook) throw ApiError.notFound('not_found', 'Webhook not found');

    const updated = await db.webhook.update({
      where: { id: webhook.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.events !== undefined ? { events: JSON.stringify(body.events) } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });
    return NextResponse.json({ webhook: { ...updated, events: body.events ?? JSON.parse(updated.events || '[]') } });
  },
);

export const DELETE = createApiHandler(
  {
    requireStepUp: true, requiredPermission: PERMISSIONS.ADMIN_WEBHOOKS_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const webhook = await db.webhook.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!webhook) throw ApiError.notFound('not_found', 'Webhook not found');
    await db.webhook.delete({ where: { id: webhook.id } });
    return NextResponse.json({ ok: true });
  },
);
