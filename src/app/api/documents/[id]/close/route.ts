/**
 * Smart EDMS — Document close
 * POST /api/documents/:id/close
 *
 * Marks a document as "closed" by setting `closedAt = now()`. This is
 * used as the retention start trigger for schedules with
 * `startTrigger = 'document.closed'`.
 *
 * Closing a document:
 *   1. Sets `closedAt` to the current time
 *   2. If the document has a retention schedule with `startTrigger='document.closed'`,
 *      recomputes `retentionDisposeAfter` from `closedAt + retentionDays`
 *   3. Does NOT change the document's `state` (closing is orthogonal to
 *      record declaration — a closed document may still be a draft or active)
 *   4. Records an audit event
 *
 * Closing is idempotent — calling close on an already-closed document
 * updates `closedAt` to the new timestamp (useful for re-opening then
 * re-closing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_UPDATE,
    audit: { eventType: 'document.close', action: 'update', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: { retentionSchedule: true },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (doc.isLocked && doc.lockedBy !== ctx.userId) {
      throw ApiError.forbidden('document_locked', 'Document is locked by another user');
    }

    const now = new Date();

    // Recompute retention if the schedule uses document.closed trigger
    let newDisposeAfter: Date | null = doc.retentionDisposeAfter;
    if (doc.retentionSchedule?.startTrigger === 'document.closed') {
      const d = new Date(now);
      d.setDate(d.getDate() + doc.retentionSchedule.retentionDays);
      newDisposeAfter = d;
    }

    const updated = await db.document.update({
      where: { id: doc.id },
      data: {
        closedAt: now,
        ...(newDisposeAfter !== doc.retentionDisposeAfter ? { retentionDisposeAfter: newDisposeAfter } : {}),
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.close',
      action: 'update',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: {
        closedAt: now,
        recomputeRetention: newDisposeAfter !== doc.retentionDisposeAfter,
        newDisposeAfter: newDisposeAfter?.toISOString() ?? null,
      },
    });

    logger.info('document.closed', {
      tenantId: ctx.tenantId,
      documentId: doc.id,
      userId: ctx.userId,
      recomputeRetention: newDisposeAfter !== doc.retentionDisposeAfter,
    });

    return NextResponse.json({
      ok: true,
      closedAt: updated.closedAt,
      retentionDisposeAfter: updated.retentionDisposeAfter,
    });
  },
);
