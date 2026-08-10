/**
 * Smart EDMS — Comment detail (resolve / delete)
 * PATCH  /api/documents/:id/comments/:cid   { resolved: true }
 * DELETE /api/documents/:id/comments/:cid
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

const patchSchema = z.object({ resolved: z.boolean() });

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    // SECURITY FIX (M-DOC-19): Verify the comment belongs to the URL document.
    // The previous lookup used only `id + tenantId` — an attacker could resolve
    // a comment on document B by sending the request to
    // `/api/documents/<any-doc-they-can-read>/comments/<victim-comment-id>`.
    const comment = await db.documentComment.findFirst({
      where: { id: params!.cid, documentId: params!.id, tenantId: ctx.tenantId },
    });
    if (!comment) throw ApiError.notFound('not_found', 'Comment not found');

    const updated = await db.documentComment.update({
      where: { id: comment.id },
      data: { resolvedAt: body.resolved ? new Date() : null, resolvedBy: body.resolved ? ctx.userId : null },
    });
    return NextResponse.json({ comment: updated });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    // SECURITY FIX (M-DOC-19): Verify the comment belongs to the URL document.
    const comment = await db.documentComment.findFirst({
      where: { id: params!.cid, documentId: params!.id, tenantId: ctx.tenantId },
    });
    if (!comment) throw ApiError.notFound('not_found', 'Comment not found');
    if (comment.authorId !== ctx.userId && !ctx.session.user.permissions.includes(PERMISSIONS.ADMIN_VIEW)) {
      throw ApiError.forbidden('not_author', 'Only the author or an admin can delete comments');
    }
    await db.documentComment.delete({ where: { id: comment.id } });
    return NextResponse.json({ ok: true });
  },
);
