/**
 * Smart EDMS — Declare document as record
 * POST /api/documents/:id/declare-record
 *
 * Declaring a record makes it immutable (no delete, no metadata changes
 * without approval). Records can only be disposed via retention disposition.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_DECLARE_RECORD,
    audit: { eventType: 'document.record.declare', action: 'update', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (doc.isRecord) {
      throw ApiError.badRequest('already_record', 'Document is already declared as a record');
    }

    const body = await req.json().catch(() => ({}));
    const reason = body.reason || 'Manual record declaration';

    const updated = await db.document.update({
      where: { id: doc.id },
      data: { isRecord: true, state: 'record' },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.record.declared',
      action: 'update',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      reason,
      metadata: { previousState: doc.state },
    });

    return NextResponse.json({ document: updated });
  },
);
