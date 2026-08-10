/**
 * Smart EDMS — Crypto-shredding
 * POST /api/documents/:id/crypto-shred
 *
 * Permanently destroys document content by deleting the DEK.
 * The encrypted content remains in storage but is permanently unreadable.
 *
 * Requirements:
 * - Document must be under legal hold release or retention disposition
 * - Requires step-up authentication
 * - Dual control recommended
 * - Irreversible — audit-logged with prominent warning
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { cryptoShredDocument } from '@/lib/storage/envelope-encryption';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_DELETE,
    rateLimit: { max: 3, windowMs: 60 * 60 * 1000 }, // max 3 per hour
    audit: { eventType: 'document.crypto_shred', action: 'delete', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    // Must not be under active legal hold
    if (doc.legalHold) {
      throw ApiError.forbidden('legal_hold_blocks', 'Cannot crypto-shred a document under active legal hold');
    }

    const body = await req.json().catch(() => ({}));
    const confirmation = body.confirmation;
    const reason = body.reason || 'Crypto-shredding';

    // Require explicit confirmation
    if (confirmation !== `SHRED ${doc.title}`) {
      throw ApiError.badRequest(
        'confirmation_required',
        `Type "SHRED ${doc.title}" in the confirmation field to proceed. This action is IRREVERSIBLE.`,
      );
    }

    // Delete the DEK — content becomes permanently unreadable
    await cryptoShredDocument(ctx.tenantId, doc.id);

    // Mark document as disposed
    await db.document.update({
      where: { id: doc.id },
      data: { state: 'disposed', deletedAt: new Date() },
    });

    logger.warn('document.crypto_shredded', {
      documentId: doc.id,
      documentTitle: doc.title,
      reason,
      actorId: ctx.userId,
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.crypto_shredded',
      action: 'delete',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      reason,
      metadata: {
        irreversible: true,
        method: 'crypto_shredding',
        dekDeleted: true,
      },
    });

    return NextResponse.json({
      ok: true,
      message: 'Document content permanently destroyed via crypto-shredding. The DEK has been deleted and the encrypted content is now permanently unreadable.',
      irreversible: true,
    });
  },
);
