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
// SECURITY FIX (M-DOC-12): Cap the number of versions per document.
// Without a cap, a single document could accumulate terabytes of versions
// (100 MB × 1000 = 100 GB), exhausting disk + OCR queue capacity.
const MAX_VERSIONS_PER_DOCUMENT = 50;

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
    // SECURITY FIX (H6): Ownership check
    const { canModifyDocument } = await import('@/lib/documents/access-control');
    const hasAccess = await canModifyDocument(ctx.userId, ctx.tenantId, params!.id, ctx.session.user.permissions);
    if (!hasAccess) throw ApiError.notFound('document_not_found', 'Document not found or you do not have write access');

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
    // SECURITY FIX (M-DOC-13): Optional client-supplied SHA-256.
    const clientChecksumSha256 = (formData.get('clientChecksumSha256') as string | null)?.trim().toLowerCase() || '';
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

    // SECURITY FIX (M-DOC-13): Verify client-supplied checksum if present.
    if (clientChecksumSha256) {
      if (!/^[0-9a-f]{64}$/.test(clientChecksumSha256)) {
        throw ApiError.badRequest('invalid_checksum', 'clientChecksumSha256 must be 64 lowercase hex chars');
      }
      const { timingSafeEqualStr } = await import('@/lib/auth/crypto');
      if (!timingSafeEqualStr(clientChecksumSha256, checksumSha256)) {
        throw ApiError.badRequest(
          'checksum_mismatch',
          'The uploaded file does not match the client-supplied SHA-256. The upload may have been truncated in transit.',
        );
      }
    }

    const storage = getFileStorage();
    const result = await db.$transaction(async (tx) => {
      const latestVersion = await tx.documentVersion.findFirst({
        where: { documentId: doc.id },
        orderBy: { versionNumber: 'desc' },
      });
      const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;

      // SECURITY FIX (M-DOC-12): Reject new versions beyond the cap.
      if (versionNumber > MAX_VERSIONS_PER_DOCUMENT) {
        throw ApiError.badRequest(
          'max_versions_exceeded',
          `This document already has the maximum of ${MAX_VERSIONS_PER_DOCUMENT} versions. Archive old versions or contact an administrator.`,
        );
      }

      // SECURITY FIX (M-DOC-12): Reject no-op versions (identical checksum).
      // Prevents a user from re-uploading the same file repeatedly to bloat
      // storage or to spam the audit log.
      if (latestVersion && latestVersion.checksumSha256 === checksumSha256) {
        throw ApiError.badRequest(
          'duplicate_version',
          'The uploaded file is identical to the latest version. No new version was created.',
        );
      }

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
