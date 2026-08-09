/**
 * Smart EDMS — Classification history
 * GET /api/documents/:id/classification-history
 *
 * Returns all classification changes for this document.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const changes = await db.classificationChange.findMany({
      where: { documentId: doc.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        fromClass: { select: { code: true, name: true, color: true, level: true } },
        toClass: { select: { code: true, name: true, color: true, level: true } },
        actor: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ changes });
  },
);
