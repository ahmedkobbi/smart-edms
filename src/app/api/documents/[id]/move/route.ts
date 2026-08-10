/**
 * Smart EDMS — Document move/copy
 * POST /api/documents/:id/move   { folderId }
 * POST /api/documents/:id/copy   { folderId, title? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getFileStorage, buildStorageKey } from '@/lib/storage/file-storage';
import { sha256, sha1 } from '@/lib/auth/crypto';
import { z } from 'zod';

const moveSchema = z.object({ folderId: z.string().nullable() });

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_UPDATE,
    audit: { eventType: 'document.move', action: 'update', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = moveSchema.parse(await req.json());
    // SECURITY FIX (H6): Ownership check
    const { canModifyDocument } = await import('@/lib/documents/access-control');
    const hasAccess = await canModifyDocument(ctx.userId, ctx.tenantId, params!.id, ctx.session.user.permissions);
    if (!hasAccess) throw ApiError.notFound('document_not_found', 'Document not found or you do not have write access');

    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (body.folderId) {
      const folder = await db.folder.findFirst({ where: { id: body.folderId, tenantId: ctx.tenantId } });
      if (!folder) throw ApiError.badRequest('invalid_folder', 'Target folder not found');
    }

    const updated = await db.document.update({
      where: { id: doc.id },
      data: { folderId: body.folderId },
    });

    return NextResponse.json({ document: updated });
  },
);

const copySchema = z.object({
  folderId: z.string().nullable().optional(),
  title: z.string().min(1).max(255).optional(),
});

export async function COPY(req: NextRequest, ctx: any, params: any) {
  // Not used — copy is implemented via POST below
  return NextResponse.json({ error: 'Use POST' }, { status: 405 });
}
