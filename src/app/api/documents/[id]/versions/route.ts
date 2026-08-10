/**
 * Smart EDMS — Document versions
 *
 * GET   /api/documents/:id/versions   list all versions
 * POST  /api/documents/:id/versions   upload new version
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { getFileStorage, buildStorageKey } from '@/lib/storage/file-storage';
import { validateUploadedFile } from '@/lib/storage/file-validation';
import { sha256, sha1 } from '@/lib/auth/crypto';
import { getDocumentDek, encryptWithDek } from '@/lib/storage/envelope-encryption';
import { recordAuditEvent } from '@/lib/audit/audit-service';

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const versions = await db.documentVersion.findMany({
      where: { documentId: params!.id, tenantId: ctx.tenantId },
      orderBy: { versionNumber: 'desc' },
      include: { uploader: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ versions });
  },
);

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_UPDATE,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: { eventType: 'document.version.create', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (doc.isLocked && doc.lockedBy !== ctx.userId) {
      throw ApiError.forbidden('document_locked', 'Document is locked');
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const changeReason = (formData.get('changeReason') as string) || 'New version';
    if (!file) throw ApiError.badRequest('missing_file', 'File is required');
    if (file.size > MAX_UPLOAD_SIZE) throw ApiError.badRequest('file_too_large', 'File too large');

    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const head = buf.subarray(0, Math.min(buf.length, 8192));
    const validation = validateUploadedFile(file.type || 'application/octet-stream', head, file.size);
    if (!validation.ok) {
      throw ApiError.badRequest('invalid_file', validation.error || 'File validation failed', {
        detectedMime: validation.detectedMime,
      });
    }

    const checksumSha256 = sha256(buf);
    const checksumSha1 = sha1(buf);

    const storage = getFileStorage();
    const result = await db.$transaction(async (tx) => {
      const latestVersion = await tx.documentVersion.findFirst({
        where: { documentId: doc.id },
        orderBy: { versionNumber: 'desc' },
      });
      const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
      const versionId = `${doc.id}_v${versionNumber}`;
      const storageKey = buildStorageKey(ctx.tenantId, doc.id, versionId, file.name);
      const mimeType = validation.detectedMime || file.type;

      // Encrypt with document's DEK (envelope encryption)
      const dek = await getDocumentDek(ctx.tenantId, doc.id);
      let encryptedBuf = buf;
      let encIv: string | undefined;
      if (dek) {
        const encrypted = encryptWithDek(dek, buf);
        encryptedBuf = Buffer.from(encrypted.ciphertext, 'base64');
        encIv = encrypted.iv;
      }
      await storage.put(storageKey, encryptedBuf, mimeType, {
        tenantId: ctx.tenantId,
        documentId: doc.id,
        version: String(versionNumber),
        uploadedBy: ctx.userId,
        encrypted: 'true',
        iv: encIv || '',
      });

      const version = await tx.documentVersion.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: doc.id,
          versionNumber,
          storageKey,
          fileName: file.name,
          mimeType,
          sizeBytes: file.size,
          checksumSha256,
          checksumSha1,
          uploadedById: ctx.userId,
          changeReason,
          metadata: JSON.stringify({ ...(JSON.parse(doc.metadata || '{}')), _encIv: encIv }),
        },
      });

      await tx.document.update({
        where: { id: doc.id },
        data: { currentVersion: versionNumber, updatedAt: new Date() },
      });

      return { version };
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.version.create',
      action: 'create',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      reason: changeReason,
      metadata: {
        versionNumber: result.version.versionNumber,
        fileName: file.name,
        sizeBytes: file.size,
        checksumSha256,
      },
    });

    // Re-index text extraction + OCR for the new version
    // Enqueue as background job if Redis available, fallback to in-process
    try {
      const { enqueueOcrJob } = await import('@/lib/queue/redis-queue');
      await enqueueOcrJob({
        tenantId: ctx.tenantId,
        documentId: doc.id,
        versionId: result.version.id,
        mimeType: result.version.mimeType,
        storageKey: result.version.storageKey,
        startedBy: ctx.userId,
      });
    } catch {
      const { indexDocumentText } = await import('@/lib/documents/text-extraction');
      indexDocumentText(ctx.tenantId, doc.id, result.version.id).catch(() => {});
    }
    const { indexDocument: osIndexDocument } = await import('@/lib/search/opensearch-service');
    osIndexDocument(ctx.tenantId, doc.id).catch(() => {});

    return NextResponse.json({ version: result.version }, { status: 201 });
  },
);
