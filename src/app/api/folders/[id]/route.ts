/**
 * Smart EDMS — Folder detail
 * PATCH  /api/folders/:id   rename / move
 * DELETE /api/folders/:id   delete (documents are moved to root, not deleted)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { z } from 'zod';

const MAX_FOLDER_DEPTH = 32;

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  parentId: z.string().nullable().optional(),
});

/**
 * Walk up the parent chain from `startId` to root and return true if
 * `targetId` appears in the chain. Capped at MAX_FOLDER_DEPTH levels to
 * bound runtime and protect against malformed cycles.
 */
async function isInParentChain(startId: string | null, targetId: string, tenantId: string): Promise<boolean> {
  let current = startId;
  let depth = 0;
  while (current && depth < MAX_FOLDER_DEPTH) {
    if (current === targetId) return true;
    const f = await db.folder.findFirst({
      where: { id: current, tenantId },
      select: { parentId: true },
    });
    if (!f) return false;
    current = f.parentId;
    depth++;
  }
  return false;
}

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_UPDATE },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const folder = await db.folder.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!folder) throw ApiError.notFound('not_found', 'Folder not found');

    // SECURITY FIX (M-DOC-1): Folder PATCH has no ownership check (IDOR).
    // End-users with DOCUMENT_UPDATE could rename/move any folder in the
    // tenant, including folders anchoring other users' documents. Restrict
    // to the folder's creator or admins.
    const isFolderAdmin = hasPermission(ctx.session.user.permissions, PERMISSIONS.ADMIN_TENANT_MANAGE);
    if (folder.createdBy !== ctx.userId && !isFolderAdmin) {
      throw ApiError.forbidden('not_authorized', 'You can only modify folders you created');
    }

    if (body.parentId === folder.id) {
      throw ApiError.badRequest('circular', 'Cannot set parent to self');
    }

    // SECURITY FIX (M-DOC-2): Cycle detection. The previous self-loop check
    // was insufficient — A→B→C→A cycles would crash any code walking the
    // folder tree (folders list, apply-classification's collectDescendants,
    // retention inheritance). Walk up from the proposed parent to root and
    // reject if `folder.id` appears in the chain.
    if (body.parentId !== undefined && body.parentId !== null) {
      if (await isInParentChain(body.parentId, folder.id, ctx.tenantId)) {
        throw ApiError.badRequest('circular', 'Cannot create a folder cycle');
      }
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

    // SECURITY FIX (M-DOC-1): Folder DELETE ownership check (IDOR).
    const isFolderAdmin = hasPermission(ctx.session.user.permissions, PERMISSIONS.ADMIN_TENANT_MANAGE);
    if (folder.createdBy !== ctx.userId && !isFolderAdmin) {
      throw ApiError.forbidden('not_authorized', 'You can only delete folders you created');
    }

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
