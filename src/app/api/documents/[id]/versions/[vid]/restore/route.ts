/**
 * Smart EDMS — Restore previous version
 * POST /api/documents/:id/versions/:vid/restore
 *
 * Creates a NEW version with the content of the specified old version.
 * Does NOT mutate the original — restores are forward-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getFileStorage, buildStorageKey } from '@/lib/storage/file-storage';
import { sha256, sha1 } from '@/lib/auth/crypto';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_VERSION_RESTORE,
    audit: { eventType: 'document.version.restore', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');
    if (doc.isLocked && doc.lockedBy !== ctx.userId) {
      throw ApiError.forbidden('document_locked', 'Document is locked');
    }
    if (doc.legalHold) {
      throw ApiError.forbidden('legal_hold_blocks_restore', 'Cannot restore versions under legal hold');
    }

    const sourceVersion = await db.documentVersion.findFirst({
      where: { id: params!.vid, documentId: doc.id, tenantId: ctx.tenantId },
    });
    if (!sourceVersion) throw ApiError.notFound('version_not_found', 'Source version not found');

    const storage = getFileStorage();
    const buf = await storage.get(sourceVersion.storageKey);

    const result = await db.$transaction(async (tx) => {
      const latest = await tx.documentVersion.findFirst({
        where: { documentId: doc.id },
        orderBy: { versionNumber: 'desc' },
      });
      const newVersionNumber = (latest?.versionNumber ?? 0) + 1;
      const versionId = `${doc.id}_v${newVersionNumber}`;
      const storageKey = buildStorageKey(ctx.tenantId, doc.id, versionId, sourceVersion.fileName);

      await storage.put(storageKey, buf, sourceVersion.mimeType, {
        tenantId: ctx.tenantId,
        documentId: doc.id,
        version: String(newVersionNumber),
        restoredFrom: sourceVersion.versionNumber.toString(),
        uploadedBy: ctx.userId,
      });

      const newVersion = await tx.documentVersion.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: doc.id,
          versionNumber: newVersionNumber,
          storageKey,
          fileName: sourceVersion.fileName,
          mimeType: sourceVersion.mimeType,
          sizeBytes: sourceVersion.sizeBytes,
          checksumSha256: sha256(buf),
          checksumSha1: sha1(buf),
          uploadedById: ctx.userId,
          changeReason: `Restored from v${sourceVersion.versionNumber}`,
          metadata: sourceVersion.metadata,
        },
      });

      await tx.document.update({
        where: { id: doc.id },
        data: { currentVersion: newVersionNumber, updatedAt: new Date() },
      });

      return newVersion;
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.version.restored',
      action: 'create',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: { restoredFromVersion: sourceVersion.versionNumber, newVersion: result.versionNumber },
    });

    return NextResponse.json({ version: result });
  },
);
