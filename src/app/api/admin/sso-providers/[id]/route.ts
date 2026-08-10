/**
 * Smart EDMS — SSO Provider detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  // ... other fields
});

export const PATCH = createApiHandler(
  {
    requireStepUp: true,
    requiredPermission: PERMISSIONS.ADMIN_INTEGRATIONS_MANAGE,
    // SECURITY FIX (M-ADM-7): Audit SSO provider mutations — these affect
    // authentication paths and a silent change could enable account takeover.
    audit: { eventType: 'admin.sso_provider.update', action: 'update', resourceType: 'sso-provider', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const provider = await db.ssoProvider.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!provider) throw ApiError.notFound('not_found', 'SSO provider not found');

    let encryptedSecret = provider.clientSecretEnc;
    if (body.clientSecret !== undefined) {
      const { encryptString } = await import('@/lib/auth/crypto');
      encryptedSecret = body.clientSecret ? JSON.stringify(await encryptString(body.clientSecret)) : null;
    }

    const updated = await db.ssoProvider.update({
      where: { id: provider.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
        ...(body.clientSecret !== undefined ? { clientSecretEnc: encryptedSecret } : {}),
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.sso_provider.update',
      action: 'update',
      resourceType: 'sso-provider',
      resourceId: provider.id,
      resourceName: provider.name,
      result: 'allow',
      metadata: {
        changes: Object.keys(body),
        secretRotated: body.clientSecret !== undefined,
        enabledToggled: body.enabled !== undefined,
      },
    });

    return NextResponse.json({ provider: { ...updated, clientSecretEnc: '***' } });
  },
);

export const DELETE = createApiHandler(
  {
    requireStepUp: true,
    requiredPermission: PERMISSIONS.ADMIN_INTEGRATIONS_MANAGE,
    audit: { eventType: 'admin.sso_provider.delete', action: 'delete', resourceType: 'sso-provider', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const provider = await db.ssoProvider.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!provider) throw ApiError.notFound('not_found', 'SSO provider not found');
    await db.ssoProvider.delete({ where: { id: provider.id } });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.sso_provider.delete',
      action: 'delete',
      resourceType: 'sso-provider',
      resourceId: provider.id,
      resourceName: provider.name,
      result: 'allow',
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  },
);
