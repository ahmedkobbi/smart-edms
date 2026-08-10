/**
 * Smart EDMS — Webhook detail
 * PATCH  /api/admin/webhooks/:id
 * DELETE /api/admin/webhooks/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

/**
 * Validate a webhook URL: HTTPS-only in production + SSRF guard (with DNS
 * resolution). Shared between POST (create) and PATCH (update) so that an
 * admin cannot bypass the SSRF check by creating a benign webhook and then
 * PATCHing its URL to an internal target.
 *
 * SECURITY FIX (M-ADM-4): PATCH previously skipped the SSRF re-check entirely.
 * SECURITY FIX (M-ADM-5): HTTPS enforcement in production.
 * SECURITY FIX (M-ADM-6): Async SSRF guard defeats DNS rebinding.
 */
async function validateWebhookUrl(url: string): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
    throw ApiError.badRequest('invalid_url', 'Webhook URL must use HTTPS in production');
  }
  const { isSafeOutboundUrl } = await import('@/lib/security/ssrf-guard');
  const check = await isSafeOutboundUrl(url);
  if (!check.allowed) {
    throw ApiError.badRequest('invalid_url', `Webhook URL is not allowed: ${check.reason}`);
  }
}

export const PATCH = createApiHandler(
  {
    requireStepUp: true,
    requiredPermission: PERMISSIONS.ADMIN_WEBHOOKS_MANAGE,
    audit: { eventType: 'admin.webhook.update', action: 'update', resourceType: 'webhook', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const webhook = await db.webhook.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!webhook) throw ApiError.notFound('not_found', 'Webhook not found');

    // SECURITY FIX (M-ADM-4): Re-run the SSRF + HTTPS validation on PATCH.
    if (body.url !== undefined && body.url !== webhook.url) {
      await validateWebhookUrl(body.url);
    }

    const updated = await db.webhook.update({
      where: { id: webhook.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.events !== undefined ? { events: JSON.stringify(body.events) } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });

    // SECURITY FIX (M-ADM-7): Record an audit event on webhook mutation.
    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.webhook.update',
      action: 'update',
      resourceType: 'webhook',
      resourceId: webhook.id,
      resourceName: webhook.name,
      result: 'allow',
      metadata: {
        changes: Object.keys(body),
        urlChanged: body.url !== undefined,
      },
    });

    return NextResponse.json({ webhook: { ...updated, events: body.events ?? JSON.parse(updated.events || '[]') } });
  },
);

export const DELETE = createApiHandler(
  {
    requireStepUp: true,
    requiredPermission: PERMISSIONS.ADMIN_WEBHOOKS_MANAGE,
    audit: { eventType: 'admin.webhook.delete', action: 'delete', resourceType: 'webhook', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const webhook = await db.webhook.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!webhook) throw ApiError.notFound('not_found', 'Webhook not found');
    await db.webhook.delete({ where: { id: webhook.id } });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.webhook.delete',
      action: 'delete',
      resourceType: 'webhook',
      resourceId: webhook.id,
      resourceName: webhook.name,
      result: 'allow',
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  },
);
