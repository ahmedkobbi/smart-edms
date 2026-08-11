/**
 * Smart EDMS — Saved searches
 * GET  /api/saved-searches
 * POST /api/saved-searches   { name, query, isShared? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx) => {
    const items = await db.savedSearch.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ userId: ctx.userId }, { isShared: true }],
      },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ items: items.map((s) => ({ ...s, query: JSON.parse(s.query || '{}') })) });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  query: z.record(z.string(), z.unknown()),
  isShared: z.boolean().default(false),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.SEARCH_USE,
    // SECURITY FIX (L-DOC-7): Rate-limit saved-search creation. Without a
    // cap, a user can spam unique names to fill the SavedSearch table.
    rateLimit: { max: 20, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());
    const existing = await db.savedSearch.findFirst({
      where: { name: body.name, userId: ctx.userId, tenantId: ctx.targetTenantId },
    });
    if (existing) throw ApiError.conflict('exists', 'Saved search with this name already exists');

    const ss = await db.savedSearch.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        name: body.name,
        query: JSON.stringify(body.query),
        isShared: body.isShared,
      },
    });
    return NextResponse.json({ savedSearch: { ...ss, query: body.query } }, { status: 201 });
  },
);
