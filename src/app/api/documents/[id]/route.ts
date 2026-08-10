/**
 * Smart EDMS — Document detail
 *
 * GET    /api/documents/:id   fetch document + latest version + classification
 * PATCH  /api/documents/:id   update metadata, title, description, classification
 * DELETE /api/documents/:id   soft-delete (respects legal hold + retention)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError, ApiContext } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { fireWebhook } from '@/lib/notifications/notify';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx: ApiContext, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: {
        classification: true,
        owner: { select: { id: true, name: true, email: true } },
        folder: true,
        retentionSchedule: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 20,
          include: { uploader: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { shares: true, approvals: true, versions: true, comments: true } },
      },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    // Permission check: end users only see own / shared
    if (!hasPermission(ctx.session.user.permissions, PERMISSIONS.DOCUMENT_READ)) {
      const isOwner = doc.ownerId === ctx.userId;
      if (!isOwner) {
        // Check direct share
        const share = await db.share.findFirst({
          where: {
            documentId: doc.id,
            tenantId: ctx.tenantId,
            revokedAt: null,
            OR: [{ recipientUserId: ctx.userId }, { recipientEmail: ctx.session.user.email }],
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            ],
          },
        });
        if (!share) throw ApiError.forbidden('not_authorized', 'Not authorized to view this document');
      }
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.read',
      action: 'read',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: { classificationId: doc.classificationId, state: doc.state },
    });

    // Track recent view (fire-and-forget)
    await db.recentView.upsert({
      where: { userId_documentId: { userId: ctx.userId, documentId: doc.id } },
      update: { viewedAt: new Date() },
      create: { tenantId: ctx.tenantId, userId: ctx.userId, documentId: doc.id },
    }).catch(() => {});

    return NextResponse.json({ document: doc });
  },
);

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  documentType: z.string().max(100).optional(),
  classificationId: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  shareAllowed: z.boolean().optional(),
  downloadAllowed: z.boolean().optional(),
  previewAllowed: z.boolean().optional(),
  watermarkEnabled: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_UPDATE,
    audit: { eventType: 'document.update', action: 'update', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx: ApiContext, params) => {
    const body = patchSchema.parse(await req.json());

    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: { classification: true },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (doc.isLocked && doc.lockedBy !== ctx.userId) {
      throw ApiError.forbidden('document_locked', `Document is locked by another user`);
    }

    // Classification change handling
    let classificationChange: any = null;
    if (body.classificationId !== undefined && body.classificationId !== doc.classificationId) {
      const newClass = body.classificationId
        ? await db.classification.findFirst({ where: { id: body.classificationId, tenantId: ctx.tenantId } })
        : null;
      const oldClass = doc.classification;
      const isDowngrade = newClass && oldClass && newClass.level < oldClass.level;
      if (isDowngrade && !hasPermission(ctx.session.user.permissions, PERMISSIONS.DOCUMENT_CLASSIFY_DOWNGRADE)) {
        throw ApiError.forbidden('classification_downgrade_forbidden', 'Downgrading classification requires document:classify.downgrade permission');
      }
      if (doc.legalHold && isDowngrade) {
        throw ApiError.forbidden('legal_hold_blocks_downgrade', 'Cannot downgrade classification while document is under legal hold');
      }
      classificationChange = { newClass, oldClass, isDowngrade: !!isDowngrade };
    }

    const updated = await db.$transaction(async (tx) => {
      // --- Retention recompute on lastModified trigger ---
      // If the document has a retention schedule with startTrigger='document.lastModified',
      // recompute retentionDisposeAfter to reflect the new modification time.
      let recomputeRetention = false;
      if (doc.retentionScheduleId) {
        const schedule = await tx.retentionSchedule.findUnique({
          where: { id: doc.retentionScheduleId },
        });
        if (schedule?.startTrigger === 'document.lastModified') {
          recomputeRetention = true;
        }
      }

      const upd = await tx.document.update({
        where: { id: doc.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.documentType !== undefined ? { documentType: body.documentType } : {}),
          ...(body.classificationId !== undefined ? { classificationId: body.classificationId } : {}),
          ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
          ...(body.tags !== undefined ? { tags: JSON.stringify(body.tags) } : {}),
          ...(body.metadata !== undefined ? { metadata: JSON.stringify(body.metadata) } : {}),
          ...(body.shareAllowed !== undefined ? { shareAllowed: body.shareAllowed } : {}),
          ...(body.downloadAllowed !== undefined ? { downloadAllowed: body.downloadAllowed } : {}),
          ...(body.previewAllowed !== undefined ? { previewAllowed: body.previewAllowed } : {}),
          ...(body.watermarkEnabled !== undefined ? { watermarkEnabled: body.watermarkEnabled } : {}),
          // Recompute retention if the schedule uses lastModified trigger
          ...(recomputeRetention ? { retentionDisposeAfter: computeDisposeDate(new Date(), (await tx.retentionSchedule.findUnique({ where: { id: doc.retentionScheduleId! } }))!.retentionDays) } : {}),
        },
      });

      if (classificationChange) {
        await tx.classificationChange.create({
          data: {
            tenantId: ctx.tenantId,
            documentId: doc.id,
            fromClassId: classificationChange.oldClass?.id ?? null,
            toClassId: classificationChange.newClass?.id ?? null,
            reason: body.reason ?? null,
            actorId: ctx.userId,
            isDowngrade: classificationChange.isDowngrade,
            approved: true,
          },
        });
      }
      return upd;
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.update',
      action: 'update',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      reason: body.reason,
      metadata: {
        changes: Object.keys(body).filter((k) => k !== 'reason'),
        classificationChanged: !!classificationChange,
        isDowngrade: classificationChange?.isDowngrade ?? false,
      },
    });

    if (classificationChange) {
      // Emit dedicated classification change audit event (§9.12)
      await recordAuditEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        actorEmail: ctx.session.user.email,
        actorIp: ctx.ip,
        actorUserAgent: ctx.userAgent,
        correlationId: ctx.correlationId,
        eventType: 'document.classify',
        action: 'update',
        resourceType: 'document',
        resourceId: doc.id,
        resourceName: doc.title,
        result: 'allow',
        reason: body.reason || 'Classification changed',
        metadata: {
          fromClassId: classificationChange.oldClass?.id ?? null,
          fromClassName: classificationChange.oldClass?.name ?? null,
          toClassId: classificationChange.newClass?.id ?? null,
          toClassName: classificationChange.newClass?.name ?? null,
          isDowngrade: classificationChange.isDowngrade,
        },
      });
      await fireWebhook(ctx.tenantId, 'classification.changed', { documentId: doc.id, title: doc.title, fromClassId: doc.classificationId, toClassId: body.classificationId, isDowngrade: classificationChange?.isDowngrade });
    }

    await fireWebhook(ctx.tenantId, 'document.updated', { documentId: doc.id, title: doc.title, changes: Object.keys(body) });

    return NextResponse.json({ document: updated });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_DELETE,
    audit: { eventType: 'document.delete', action: 'delete', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx: ApiContext, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (doc.legalHold) {
      throw ApiError.forbidden('legal_hold_blocks_delete', 'Document is under legal hold and cannot be deleted');
    }
    if (doc.isRecord) {
      throw ApiError.forbidden('record_blocks_delete', 'Document is declared as a record; use retention disposition instead');
    }

    const reason = req.nextUrl.searchParams.get('reason') || 'User-initiated delete';

    await db.document.update({
      where: { id: doc.id },
      data: { deletedAt: new Date(), state: 'archived' },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.delete',
      action: 'delete',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      reason,
      metadata: {},
    });

    await fireWebhook(ctx.tenantId, 'document.deleted', { documentId: doc.id, title: doc.title, reason });

    return NextResponse.json({ ok: true });
  },
);

/**
 * Compute the retention dispose-after date from a start date + retention days.
 * Used when recomputing retention on `document.lastModified` trigger.
 */
function computeDisposeDate(start: Date, days: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  return d;
}
