/**
 * Smart EDMS — Service Accounts API
 * Similar to API keys but scoped to automation/integration use cases.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { randomToken, sha256 } from '@/lib/auth/crypto';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_API_KEYS_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.serviceAccount.findMany({
      where: { tenantId: ctx.tenantId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({
      items: items.map((s) => ({ ...s, scopes: JSON.parse(s.scopes || '[]') })),
    });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_API_KEYS_MANAGE,
    audit: { eventType: 'admin.service-account.create', action: 'create', resourceType: 'service-account', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const rawKey = `sa_${randomToken(40)}`;
    const keyHash = sha256(rawKey);
    const keyPrefix = rawKey.slice(0, 10);

    const sa = await db.serviceAccount.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        description: body.description,
        keyHash,
        keyPrefix,
        scopes: JSON.stringify(body.scopes),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      serviceAccount: { ...sa, scopes: body.scopes, keyHash: undefined },
      key: rawKey,
      warning: 'Store this key securely. It will not be shown again.',
    }, { status: 201 });
  },
);
