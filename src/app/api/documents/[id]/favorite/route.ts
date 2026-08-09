/**
 * Smart EDMS — Favorite toggle
 * POST   /api/documents/:id/favorite   add to favorites
 * DELETE /api/documents/:id/favorite   remove from favorites
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null } });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    await db.favorite.upsert({
      where: { userId_documentId: { userId: ctx.userId, documentId: doc.id } },
      update: {},
      create: { tenantId: ctx.tenantId, userId: ctx.userId, documentId: doc.id },
    });
    return NextResponse.json({ ok: true, favorited: true });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    await db.favorite.deleteMany({
      where: { userId: ctx.userId, documentId: params!.id, tenantId: ctx.tenantId },
    });
    return NextResponse.json({ ok: true, favorited: false });
  },
);
