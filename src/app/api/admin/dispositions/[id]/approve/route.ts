/**
 * Smart EDMS — Disposition approval
 * POST /api/admin/dispositions/:id/approve   { approved: true|false, comment? }
 *
 * If approved + action=delete: soft-deletes the document, generates a
 * certificate of destruction (SHA-256 hash of record), marks record executed.
 * If approved + action=archive: marks document state=archived.
 * If rejected: cancels the disposition.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { sha256 } from '@/lib/auth/crypto';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const schema = z.object({
  approved: z.boolean(),
  comment: z.string().max(1000).optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.RETENTION_DISPOSITION_APPROVE,
    // SECURITY FIX (M-ADM-11): Disposition approval is a destructive,
    // records-compliance-significant action (deletes or archives a document,
    // generates a certificate of destruction). Require step-up auth so a
    // stolen session cookie cannot silently destroy records.
    requireStepUp: true,
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'disposition.approve', action: 'update', resourceType: 'disposition', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = schema.parse(await req.json());

    const record = await db.dispositionRecord.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, status: 'pending' },
      include: { document: true },
    });
    if (!record) throw ApiError.notFound('not_found', 'Pending disposition not found');
    if (record.document?.legalHold) {
      throw ApiError.forbidden('legal_hold_blocks', 'Document is under legal hold — release first');
    }

    if (!body.approved) {
      await db.dispositionRecord.update({
        where: { id: record.id },
        data: {
          status: 'cancelled',
          approvedById: ctx.userId,
          reason: body.comment,
        },
      });
      return NextResponse.json({ ok: true, status: 'cancelled' });
    }

    // Approved — execute disposition
    const result = await db.$transaction(async (tx) => {
      let certificateHash: string | null = null;

      if (record.action === 'delete') {
        // Soft-delete the document
        await tx.document.update({
          where: { id: record.documentId },
          data: { deletedAt: new Date(), state: 'disposed' },
        });

        // Generate certificate of destruction
        const certPayload = {
          tenantId: ctx.tenantId,
          documentId: record.documentId,
          documentTitle: record.document.title,
          action: 'delete',
          approvedBy: ctx.userId,
          approvedAt: new Date().toISOString(),
          reason: body.comment || record.reason,
          scheduleId: record.scheduleId,
        };
        certificateHash = sha256(JSON.stringify(certPayload));
      } else if (record.action === 'archive') {
        await tx.document.update({
          where: { id: record.documentId },
          data: { state: 'archived' },
        });
      }

      const updated = await tx.dispositionRecord.update({
        where: { id: record.id },
        data: {
          status: 'executed',
          approvedById: ctx.userId,
          reason: body.comment,
          certificateHash,
          executedAt: new Date(),
        },
      });

      return updated;
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: record.action === 'delete' ? 'disposition.executed.delete' : 'disposition.executed.archive',
      action: 'delete',
      resourceType: 'disposition',
      resourceId: record.id,
      resourceName: record.document?.title,
      result: 'allow',
      reason: body.comment,
      metadata: {
        documentId: record.documentId,
        action: record.action,
        certificateHash: result.certificateHash,
      },
    });

    return NextResponse.json({ disposition: result });
  },
);
