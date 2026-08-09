/**
 * Smart EDMS — Recent view tracker
 * POST /api/documents/:id/recent   record a view (upserts viewedAt)
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

    await db.recentView.upsert({
      where: { userId_documentId: { userId: ctx.userId, documentId: doc.id } },
      update: { viewedAt: new Date() },
      create: { tenantId: ctx.tenantId, userId: ctx.userId, documentId: doc.id },
    });

    return NextResponse.json({ ok: true });
  },
);
