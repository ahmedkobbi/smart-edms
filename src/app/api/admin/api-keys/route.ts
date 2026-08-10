/**
 * Smart EDMS — API Keys API
 *
 * POST returns the raw key ONCE. Only the hash is stored.
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
    const items = await db.apiKey.findMany({
      where: { tenantId: ctx.tenantId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({
      items: items.map((k) => ({ ...k, scopes: JSON.parse(k.scopes || '[]') })),
    });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional(),
});

const MAX_API_KEY_LIFETIME_DAYS = 90; // SECURITY FIX (M-AUTH-9): cap key lifetime
const MAX_API_KEY_LIFETIME_MS = MAX_API_KEY_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_API_KEYS_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.apikey.create', action: 'create', resourceType: 'api-key', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    // SECURITY FIX (M-AUTH-9): Enforce a maximum lifetime on API keys.
    // Previously `expiresAt` was optional — a leaked "permanent" key retained
    // access forever. Now: if no expiry is supplied, default to 90 days; if an
    // expiry is supplied, reject any value beyond 90 days. This bounds the
    // blast radius of a leaked key to a finite window.
    const now = Date.now();
    let expiresAt: Date;
    if (body.expiresAt) {
      expiresAt = new Date(body.expiresAt);
      if (expiresAt.getTime() > now + MAX_API_KEY_LIFETIME_MS) {
        throw ApiError.badRequest(
          'invalid_expiry',
          `API key expiry cannot exceed ${MAX_API_KEY_LIFETIME_DAYS} days`,
        );
      }
      if (expiresAt.getTime() <= now) {
        throw ApiError.badRequest('invalid_expiry', 'API key expiry must be in the future');
      }
    } else {
      expiresAt = new Date(now + MAX_API_KEY_LIFETIME_MS);
    }

    const rawKey = `se_${randomToken(32)}`;
    const keyHash = sha256(rawKey);
    const keyPrefix = rawKey.slice(0, 10);

    const apiKey = await db.apiKey.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        description: body.description,
        keyHash,
        keyPrefix,
        scopes: JSON.stringify(body.scopes),
        expiresAt,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      apiKey: { ...apiKey, scopes: body.scopes, keyHash: undefined },
      key: rawKey, // shown once
      warning: `Store this key securely. It will not be shown again. Expires in ${MAX_API_KEY_LIFETIME_DAYS} days.`,
    }, { status: 201 });
  },
);
