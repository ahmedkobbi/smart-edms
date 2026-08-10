/**
 * Smart EDMS — Document comments
 * GET  /api/documents/:id/comments
 * POST /api/documents/:id/comments   { body, parentId? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { notify } from '@/lib/notifications/notify';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const comments = await db.documentComment.findMany({
      where: { documentId: doc.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ comments });
  },
);

const createSchema = z.object({
  body: z.string().min(1).max(5000),
  parentId: z.string().optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_READ,
    // SECURITY FIX (L-DOC-4): Rate-limit comment creation. Each POST creates
    // a DocumentComment row AND fires a notify() to the document owner — a
    // stolen session could spam thousands of comments/min, flooding the DB
    // and the owner's notification queue.
    rateLimit: { max: 30, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx, params) => {
    const body = createSchema.parse(await req.json());
    const doc = await db.document.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null } });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (body.parentId) {
      const parent = await db.documentComment.findFirst({
        where: { id: body.parentId, documentId: doc.id, tenantId: ctx.tenantId },
      });
      if (!parent) throw ApiError.badRequest('invalid_parent', 'Parent comment not found');
    }

    const comment = await db.documentComment.create({
      data: {
        tenantId: ctx.tenantId,
        documentId: doc.id,
        authorId: ctx.userId,
        body: body.body,
        parentId: body.parentId,
      },
      include: { author: { select: { id: true, name: true, email: true } } },
    });

    // Notify document owner (if not the commenter) — pass author + docTitle
    // in metadata for i18n interpolation
    if (doc.ownerId && doc.ownerId !== ctx.userId) {
      await notify({
        tenantId: ctx.tenantId,
        userId: doc.ownerId,
        type: 'document.comment',
        severity: 'info',
        link: `/documents/${doc.id}`,
        metadata: {
          commentId: comment.id,
          documentId: doc.id,
          author: ctx.session.user.email,
          docTitle: doc.title,
        },
      });
    }

    return NextResponse.json({ comment }, { status: 201 });
  },
);
