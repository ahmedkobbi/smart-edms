/**
 * Smart EDMS — Folder detail
 * PATCH  /api/folders/:id   rename / move
 * DELETE /api/folders/:id   delete (documents are moved to root, not deleted)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  parentId: z.string().nullable().optional(),
});

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_UPDATE },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const folder = await db.folder.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!folder) throw ApiError.notFound('not_found', 'Folder not found');

    if (body.parentId === folder.id) {
      throw ApiError.badRequest('circular', 'Cannot set parent to self');
    }

    const updated = await db.folder.update({
      where: { id: folder.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
      },
    });
    return NextResponse.json({ folder: updated });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_DELETE },
  async (req: NextRequest, ctx, params) => {
    const folder = await db.folder.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!folder) throw ApiError.notFound('not_found', 'Folder not found');

    // Move documents to root (unscoped)
    await db.$transaction(async (tx) => {
      await tx.document.updateMany({
        where: { folderId: folder.id, tenantId: ctx.tenantId },
        data: { folderId: null },
      });
      // Move children to parent (or root)
      await tx.folder.updateMany({
        where: { parentId: folder.id, tenantId: ctx.tenantId },
        data: { parentId: folder.parentId },
      });
      await tx.folder.delete({ where: { id: folder.id } });
    });

    return NextResponse.json({ ok: true });
  },
);
