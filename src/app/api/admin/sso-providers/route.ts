/**
 * Smart EDMS — SSO Provider configuration
 * GET  /api/admin/sso-providers
 * POST /api/admin/sso-providers   { type: oidc|saml, ... }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { encryptString } from '@/lib/auth/crypto';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_INTEGRATIONS_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.ssoProvider.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({
      items: items.map((p) => ({
        ...p,
        clientSecretEnc: p.clientSecretEnc ? '***' : null,
        hasSecret: !!p.clientSecretEnc,
      })),
    });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['oidc', 'saml']),
  issuerUrl: z.string().url().optional(),
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  userInfoEndpoint: z.string().url().optional(),
  jwksUri: z.string().url().optional(),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  scopes: z.string().default('openid profile email'),
  metadataUrl: z.string().url().optional(),
  entityId: z.string().optional(),
  emailAttribute: z.string().default('email'),
  nameAttribute: z.string().default('name'),
  enabled: z.boolean().default(true),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_INTEGRATIONS_MANAGE,
    audit: { eventType: 'admin.sso.create', action: 'create', resourceType: 'sso-provider', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const existing = await db.ssoProvider.findFirst({
      where: { name: body.name, tenantId: ctx.tenantId },
    });
    if (existing) throw ApiError.conflict('exists', 'SSO provider with this name already exists');

    const encryptedSecret = body.clientSecret ? JSON.stringify(await encryptString(body.clientSecret)) : null;

    const provider = await db.ssoProvider.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        type: body.type,
        issuerUrl: body.issuerUrl,
        authorizationEndpoint: body.authorizationEndpoint,
        tokenEndpoint: body.tokenEndpoint,
        userInfoEndpoint: body.userInfoEndpoint,
        jwksUri: body.jwksUri,
        clientId: body.clientId,
        clientSecretEnc: encryptedSecret,
        scopes: body.scopes,
        metadataUrl: body.metadataUrl,
        entityId: body.entityId,
        emailAttribute: body.emailAttribute,
        nameAttribute: body.nameAttribute,
        enabled: body.enabled,
      },
    });

    return NextResponse.json({
      provider: { ...provider, clientSecretEnc: '***', hasSecret: !!encryptedSecret },
    }, { status: 201 });
  },
);
