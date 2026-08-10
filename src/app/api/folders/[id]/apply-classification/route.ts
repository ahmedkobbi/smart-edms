/**
 * Smart EDMS — Folder classification inheritance
 * POST /api/folders/:id/apply-classification   { classificationId, applyToChildren }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const schema = z.object({
  classificationId: z.string(),
  applyToChildren: z.boolean().default(true),
  reason: z.string().max(500).optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE,
    audit: { eventType: 'folder.apply_classification', action: 'update', resourceType: 'folder', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = schema.parse(await req.json());

    const folder = await db.folder.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!folder) throw ApiError.notFound('not_found', 'Folder not found');

    const cls = await db.classification.findFirst({
      where: { id: body.classificationId, tenantId: ctx.tenantId },
    });
    if (!cls) throw ApiError.badRequest('invalid_classification', 'Classification not found');

    let folderIds = [folder.id];
    if (body.applyToChildren) {
      const allFolders = await db.folder.findMany({
        where: { tenantId: ctx.tenantId },
        select: { id: true, parentId: true },
      });
      folderIds = collectDescendants(folder.id, allFolders);
    }

    const docs = await db.document.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        folderId: { in: folderIds },
        legalHold: false,
      },
      select: { id: true, title: true, classificationId: true },
    });

    let updated = 0;
    let skipped = 0;
    await db.$transaction(async (tx) => {
      for (const doc of docs) {
        if (doc.classificationId === body.classificationId) {
          skipped++;
          continue;
        }
        const oldClass = doc.classificationId
          ? await tx.classification.findUnique({ where: { id: doc.classificationId } })
          : null;
        const isDowngrade = oldClass && oldClass.level > cls.level;

        await tx.document.update({
          where: { id: doc.id },
          data: { classificationId: body.classificationId },
        });

        await tx.classificationChange.create({
          data: {
            tenantId: ctx.tenantId,
            documentId: doc.id,
            fromClassId: doc.classificationId,
            toClassId: body.classificationId,
            reason: body.reason || `Inherited from folder ${folder.name}`,
            actorId: ctx.userId,
            isDowngrade: !!isDowngrade,
            approved: true,
          },
        });
        updated++;
      }
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'folder.classification_applied',
      action: 'update',
      resourceType: 'folder',
      resourceId: folder.id,
      resourceName: folder.name,
      result: 'allow',
      reason: body.reason,
      metadata: {
        classificationId: body.classificationId,
        classificationCode: cls.code,
        applyToChildren: body.applyToChildren,
        updated,
        skipped,
      },
    });

    return NextResponse.json({ updated, skipped, total: docs.length });
  },
);

function collectDescendants(rootId: string, allFolders: { id: string; parentId: string | null }[]): string[] {
  const result = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const f of allFolders) {
      if (f.parentId === current && !result.includes(f.id)) {
        result.push(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
}
