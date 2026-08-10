/**
 * Smart EDMS — Copy document (creates new doc + v1 with same content)
 * POST /api/documents/:id/copy   { title?, folderId? }
 *
 * SECURITY FIX (H1): Caller must have read access to the source document.
 * Previously any end_user could copy any tenant document (bypassing the
 * document:read.own restriction) and then read the copy as its new owner.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { getFileStorage, buildStorageKey, sanitizeFileName } from '@/lib/storage/file-storage';
import { sha256, sha1 } from '@/lib/auth/crypto';
import { createDocumentDek, getDocumentDek, encryptWithDek, decryptWithDek } from '@/lib/storage/envelope-encryption';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const copySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  folderId: z.string().nullable().optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_CREATE,
    // SECURITY FIX (L-INFRA-11): Rate-limit document copy.
    rateLimit: { max: 20, windowMs: 60_000 },
    audit: { eventType: 'document.copy', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = copySchema.parse(await req.json());

    // SECURITY FIX (H1): Check read access to the source document.
    // Users without DOCUMENT_READ can only copy documents they own
    // or that have been explicitly shared with them.
    const canReadAll = hasPermission(ctx.session.user.permissions, PERMISSIONS.DOCUMENT_READ);
    const source = await db.document.findFirst({
      where: {
        id: params!.id,
        tenantId: ctx.tenantId,
        deletedAt: null,
        ...(canReadAll ? {} : {
          OR: [
            { ownerId: ctx.userId },
            { shares: { some: { recipientUserId: ctx.userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } },
          ],
        }),
      },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!source) throw ApiError.notFound('document_not_found', 'Source document not found or you do not have access');
    const sourceVersion = source.versions[0];
    if (!sourceVersion) throw ApiError.badRequest('no_version', 'Source has no versions');

    if (body.folderId) {
      const folder = await db.folder.findFirst({ where: { id: body.folderId, tenantId: ctx.tenantId } });
      if (!folder) throw ApiError.badRequest('invalid_folder', 'Target folder not found');
    }

    const storage = getFileStorage();
    const encryptedBuf = await storage.get(sourceVersion.storageKey);

    // SECURITY FIX (L-DOC-2): Decrypt the source with the source DEK + source
    // content IV, then re-encrypt with a NEW DEK + fresh IV for the copy.
    // Previously the code stored the source's ciphertext as the copy's
    // content WITHOUT creating a new DEK — so the new document had no
    // DocumentEncryptionKey row, and download/preview/redact all failed
    // (getDocumentDek returned null and the raw ciphertext was used as
    // plaintext, which is unrenderable). The copy was functionally broken.
    const sourceDek = await getDocumentDek(ctx.tenantId, source.id);
    let plaintextBuf = encryptedBuf;
    if (sourceDek) {
      const sourceMeta = JSON.parse(sourceVersion.metadata || '{}');
      const sourceIv: string | undefined = sourceMeta._encIv;
      if (sourceIv) {
        plaintextBuf = decryptWithDek(sourceDek, encryptedBuf.toString('base64'), sourceIv);
      }
    }

    const result = await db.$transaction(async (tx) => {
      const newDoc = await tx.document.create({
        data: {
          tenantId: ctx.tenantId,
          ownerId: ctx.userId,
          title: body.title || `${source.title} (copy)`,
          description: source.description,
          documentType: source.documentType,
          classificationId: source.classificationId,
          folderId: body.folderId ?? null,
          tags: source.tags,
          metadata: source.metadata,
          state: 'draft',
          currentVersion: 1,
          shareAllowed: source.shareAllowed,
          downloadAllowed: source.downloadAllowed,
          previewAllowed: source.previewAllowed,
          watermarkEnabled: source.watermarkEnabled,
        },
      });

      // Create a NEW DEK for the copy and re-encrypt with a fresh IV.
      const { dek } = await createDocumentDek(ctx.tenantId, newDoc.id, tx);
      const encrypted = encryptWithDek(dek, plaintextBuf);
      const ciphertextBuf = Buffer.from(encrypted.ciphertext, 'base64');

      const safeName = sanitizeFileName(sourceVersion.fileName);
      const versionId = `${newDoc.id}_v1`;
      const storageKey = buildStorageKey(ctx.tenantId, newDoc.id, versionId, safeName);
      await storage.put(storageKey, ciphertextBuf, sourceVersion.mimeType, {
        tenantId: ctx.tenantId,
        documentId: newDoc.id,
        version: '1',
        copiedFrom: source.id,
        uploadedBy: ctx.userId,
      });

      const version = await tx.documentVersion.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: newDoc.id,
          versionNumber: 1,
          storageKey,
          fileName: safeName,
          mimeType: sourceVersion.mimeType,
          sizeBytes: sourceVersion.sizeBytes,
          checksumSha256: sha256(plaintextBuf),
          checksumSha1: sha1(plaintextBuf),
          uploadedById: ctx.userId,
          changeReason: `Copied from ${source.title}`,
          metadata: JSON.stringify({ ...(JSON.parse(sourceVersion.metadata || '{}')), _encIv: encrypted.iv }),
        },
      });

      return { newDoc, version };
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.copied',
      action: 'create',
      resourceType: 'document',
      resourceId: result.newDoc.id,
      resourceName: result.newDoc.title,
      result: 'allow',
      metadata: { sourceDocumentId: source.id, sourceDocumentName: source.title },
    });

    return NextResponse.json({ document: result.newDoc, version: result.version }, { status: 201 });
  },
);
