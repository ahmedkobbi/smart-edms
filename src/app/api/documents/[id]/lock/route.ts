/**
 * Smart EDMS — Document lock/unlock
 * POST   /api/documents/:id/lock   { reason, expiresAt? }
 * DELETE /api/documents/:id/lock
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const lockSchema = z.object({
  reason: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_LOCK,
    audit: { eventType: 'document.lock', action: 'update', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = lockSchema.parse(await req.json());
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');
    if (doc.isLocked) throw ApiError.badRequest('already_locked', 'Document is already locked');

    const updated = await db.document.update({
      where: { id: doc.id },
      data: {
        isLocked: true,
        lockedBy: ctx.userId,
        lockedReason: body.reason ?? null,
        lockedUntil: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.lock',
      action: 'update',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      reason: body.reason,
      metadata: { expiresAt: body.expiresAt ?? null },
    });

    return NextResponse.json({ document: updated });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_UNLOCK,
    audit: { eventType: 'document.unlock', action: 'update', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');
    if (!doc.isLocked) throw ApiError.badRequest('not_locked', 'Document is not locked');

    // Only the locker or an admin can unlock
    if (doc.lockedBy !== ctx.userId && !ctx.session.user.permissions.includes(PERMISSIONS.ADMIN_VIEW)) {
      throw ApiError.forbidden('not_locker', 'Only the user who locked the document or an admin can unlock');
    }

    const updated = await db.document.update({
      where: { id: doc.id },
      data: {
        isLocked: false,
        lockedBy: null,
        lockedReason: null,
        lockedUntil: null,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.unlock',
      action: 'update',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: { previousLocker: doc.lockedBy },
    });

    return NextResponse.json({ document: updated });
  },
);
