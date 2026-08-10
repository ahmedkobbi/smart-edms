/**
 * Smart EDMS — Webhooks API
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { randomToken, sha256 } from '@/lib/auth/crypto';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_WEBHOOKS_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.webhook.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({
      items: items.map((w) => ({ ...w, events: JSON.parse(w.events || '[]'), secretHash: undefined, hasSecret: !!w.secretHash })),
    });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  generateSecret: z.boolean().default(true),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_WEBHOOKS_MANAGE,
    audit: { eventType: 'admin.webhook.create', action: 'create', resourceType: 'webhook', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    // Reject non-HTTPS URLs in production
    if (process.env.NODE_ENV === 'production' && !body.url.startsWith('https://')) {
      throw ApiError.badRequest('insecure_url', 'Webhook URL must be HTTPS in production');
    }

    // SSRF protection: block private/reserved IP ranges + cloud metadata
    const { isAllowedOutboundUrl } = await import('@/lib/security/ssrf-guard');
    const ssrfCheck = isAllowedOutboundUrl(body.url);
    if (!ssrfCheck.allowed) {
      throw ApiError.badRequest('blocked_url', `Webhook URL blocked: ${ssrfCheck.reason}`);
    }

    const secret = body.generateSecret ? randomToken(24) : null;
    const secretHash = secret ? sha256(secret) : null;

    const webhook = await db.webhook.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        url: body.url,
        events: JSON.stringify(body.events),
        secretHash,
        enabled: body.enabled,
      },
    });

    return NextResponse.json({
      webhook: { ...webhook, events: body.events, secretHash: undefined },
      secret: secret ? `whsec_${secret}` : null,
      secretWarning: secret ? 'Store this signing secret securely. It will not be shown again.' : null,
    }, { status: 201 });
  },
);
