/**
 * Smart EDMS — Saved search detail
 * GET    /api/saved-searches/:id   get a single saved search
 * PUT    /api/saved-searches/:id   update name, query, or filters
 * DELETE /api/saved-searches/:id   delete a saved search
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx, params) => {
    const ss = await db.savedSearch.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, userId: ctx.userId },
    });
    if (!ss) throw ApiError.notFound('not_found', 'Saved search not found');
    return NextResponse.json({ savedSearch: ss });
  },
);

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  query: z.string().max(500).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export const PUT = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx, params) => {
    const body = updateSchema.parse(await req.json());
    const ss = await db.savedSearch.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, userId: ctx.userId },
    });
    if (!ss) throw ApiError.notFound('not_found', 'Saved search not found');

    const updated = await db.savedSearch.update({
      where: { id: ss.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.query !== undefined ? { query: body.query } : {}),
        ...(body.filters !== undefined ? { filters: JSON.stringify(body.filters) } : {}),
      },
    });

    return NextResponse.json({ savedSearch: updated });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx, params) => {
    const ss = await db.savedSearch.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, userId: ctx.userId },
    });
    if (!ss) throw ApiError.notFound('not_found', 'Saved search not found');
    await db.savedSearch.delete({ where: { id: ss.id } });
    return NextResponse.json({ ok: true });
  },
);
