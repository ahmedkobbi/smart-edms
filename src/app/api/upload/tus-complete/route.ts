/**
 * Smart EDMS — TUS upload completion
 * POST /api/upload/tus-complete
 *
 * Called by the client after a TUS upload finishes. This endpoint:
 *   1. Reads the uploaded file from the TUS store (S3 or local)
 *   2. Validates the file (magic bytes, MIME type, size)
 *   3. Computes SHA-256 + SHA-1 checksums
 *   4. Moves the file to the permanent storage location
 *   5. Creates the Document + DocumentVersion records
 *   6. Enqueues OCR + OpenSearch indexing
 *   7. Returns the created document
 *
 * The client sends:
 *   { uploadId, fileName, mimeType, title, description, documentType,
 *     classificationId, folderId, tags, metadata, retentionScheduleId,
 *     changeReason }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError, ApiContext } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { getFileStorage, buildStorageKey, sanitizeFileName } from '@/lib/storage/file-storage';
import { validateUploadedFile, MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from '@/lib/storage/file-validation';
import { sha256, sha1 } from '@/lib/auth/crypto';
import { createDocumentDek, encryptWithDek } from '@/lib/storage/envelope-encryption';
import { z } from 'zod';
import { logger } from '@/lib/config/logger';
import { promises as fs } from 'fs';
import path from 'path';

const MAX_TUS_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

const completeSchema = z.object({
  // SECURITY FIX (C2): Strict validation of uploadId — only alphanumeric,
  // hyphens, and underscores allowed. No path traversal characters.
  uploadId: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/, 'uploadId must be alphanumeric with - or _ only'),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  documentType: z.string().max(100).default('generic'),
  classificationId: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  retentionScheduleId: z.string().nullable().optional(),
  changeReason: z.string().max(500).default('Initial upload'),
  // SECURITY FIX (M-DOC-13): Optional client-supplied SHA-256.
  clientChecksumSha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_CREATE,
    rateLimit: { max: 20, windowMs: 60_000 },
    audit: { eventType: 'document.create', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx: ApiContext) => {
    const body = completeSchema.parse(await req.json());

    // --- 1. Read the uploaded file from TUS store ---
    const tusDataDir = process.env.TUS_DATA_DIR || path.join(process.cwd(), '.tus-uploads');
    const tusFilePath = path.join(tusDataDir, body.uploadId);

    // SECURITY FIX (C2): Secondary path containment check — ensure the
    // resolved path is within the TUS data directory.
    const resolvedTusDir = path.resolve(tusDataDir);
    const resolvedFilePath = path.resolve(tusFilePath);
    if (!resolvedFilePath.startsWith(resolvedTusDir + path.sep) && resolvedFilePath !== resolvedTusDir) {
      throw ApiError.badRequest('invalid_upload_id', 'Invalid upload ID');
    }

    // Check file exists
    try {
      await fs.access(tusFilePath);
    } catch {
      throw ApiError.notFound('upload_not_found', `TUS upload ${body.uploadId} not found. It may have expired or been cleaned up.`);
    }

    const stat = await fs.stat(tusFilePath);
    const fileSize = stat.size;

    if (fileSize > MAX_TUS_SIZE) {
      throw ApiError.badRequest('file_too_large', `File exceeds ${MAX_TUS_SIZE} bytes`);
    }

    // Read file (for checksums + validation)
    // For very large files, this could stream — but for now we buffer
    // (production with S3 backend would use S3 multipart directly)
    const buf = await fs.readFile(tusFilePath);

    // --- 2. Validate the file ---
    if (!ALLOWED_MIME_TYPES.has(body.mimeType)) {
      await fs.unlink(tusFilePath).catch(() => {});
      throw ApiError.badRequest('invalid_file_type', `File type ${body.mimeType} is not allowed`);
    }

    const validation = validateUploadedFile(body.mimeType, buf as any, fileSize);
    if (!validation.ok) {
      await fs.unlink(tusFilePath).catch(() => {});
      throw ApiError.badRequest('validation_failed', validation.error || 'File validation failed');
    }

    // --- 3. Compute checksums ---
    const checksumSha256 = sha256(buf as any);
    const checksumSha1 = sha1(buf as any);

    // SECURITY FIX (M-DOC-13): Verify client-supplied checksum if present.
    if (body.clientChecksumSha256) {
      const clientChecksum = body.clientChecksumSha256.toLowerCase();
      const { timingSafeEqualStr } = await import('@/lib/auth/crypto');
      if (!timingSafeEqualStr(clientChecksum, checksumSha256)) {
        throw ApiError.badRequest(
          'checksum_mismatch',
          'The uploaded file does not match the client-supplied SHA-256. The upload may have been truncated in transit.',
        );
      }
    }

    // --- 4. Validate classification + folder ---
    if (body.classificationId) {
      const cls = await db.classification.findFirst({
        where: { id: body.classificationId, tenantId: ctx.tenantId },
      });
      if (!cls) throw ApiError.badRequest('invalid_classification', 'Classification not found');
    }

    if (body.folderId) {
      const folder = await db.folder.findFirst({
        where: { id: body.folderId, tenantId: ctx.tenantId },
      });
      if (!folder) throw ApiError.badRequest('invalid_folder', 'Folder not found');
    }

    // --- 5. Move file to permanent storage ---
    // SECURITY FIX (M-DOC-9): The previous code stored the file UNENCRYPTED
    // at rest. It called `getDocumentDek(tenantId, 'pending')` which always
    // returned null (no DEK exists for 'pending'), then ran
    // `if (dek) encryptWithDek(...)` which was a no-op — and the result was
    // discarded anyway. The raw plaintext buffer was stored.
    //
    // The fix mirrors the formData upload path (`/api/documents`): create a
    // real DEK inside the transaction, encrypt the buffer, store the
    // CIPHERTEXT, and persist `_encIv` in the version metadata so the
    // redact/preview/download paths can decrypt it later.
    const storage = getFileStorage();
    const safeFileName = sanitizeFileName(body.fileName);
    const versionId = `v1_${Date.now()}`;
    const storageKey = buildStorageKey(ctx.tenantId, 'pending', versionId, safeFileName);

    // Clean up TUS temp file (we have the buffer in memory)
    await fs.unlink(tusFilePath).catch(() => {});

    // --- 6. Create Document + DocumentVersion + DEK + ciphertext ---
    // SECURITY FIX (M-DOC-10): Use sanitized filename for the DB-stored
    // `fileName` too — previously only the storage key was sanitized, while
    // the DB stored the raw user-supplied filename including Unicode bidi
    // overrides (U+202E RTLO) that flip the apparent extension in the UI.
    const title = body.title || safeFileName;

    const result = await db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId: ctx.tenantId,
          ownerId: ctx.userId,
          title,
          description: body.description || null,
          documentType: body.documentType,
          classificationId: body.classificationId || null,
          folderId: body.folderId || null,
          tags: JSON.stringify(body.tags),
          metadata: JSON.stringify(body.metadata),
          state: 'draft',
          currentVersion: 1,
          retentionScheduleId: body.retentionScheduleId || null,
          shareAllowed: false, // deny by default (master prompt §9.11)
          downloadAllowed: true,
          previewAllowed: true,
          watermarkEnabled: true,
          ocrStatus: 'pending',
          retentionStartDate: new Date(),
          retentionDisposeAfter: body.retentionScheduleId
            ? new Date(Date.now() + 365 * 24 * 3600_000)
            : null,
        },
      });

      // Create per-document DEK (envelope encryption)
      const { dek } = await createDocumentDek(ctx.tenantId, doc.id, tx);
      const encrypted = encryptWithDek(dek, buf);

      // Fix the storageKey with the actual document ID
      const finalStorageKey = buildStorageKey(ctx.tenantId, doc.id, versionId, safeFileName);

      // Store the CIPHERTEXT (not the raw buffer)
      const ciphertextBuf = Buffer.from(encrypted.ciphertext, 'base64');
      await storage.put(finalStorageKey, ciphertextBuf, body.mimeType);

      const version = await tx.documentVersion.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: doc.id,
          versionNumber: 1,
          fileName: safeFileName, // SECURITY FIX (M-DOC-10)
          mimeType: body.mimeType,
          sizeBytes: fileSize,
          storageKey: finalStorageKey,
          checksumSha256,
          checksumSha1,
          changeReason: body.changeReason,
          uploadedById: ctx.userId,
          metadata: JSON.stringify({ ...body.metadata, _encIv: encrypted.iv }),
        },
      });

      return { doc, version };
    });

    // --- 7. Audit ---
    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.create',
      action: 'create',
      resourceType: 'document',
      resourceId: result.doc.id,
      resourceName: result.doc.title,
      result: 'allow',
      metadata: {
        versionId: result.version.id,
        fileName: safeFileName, // SECURITY FIX (M-DOC-10): sanitized in audit log too
        sizeBytes: fileSize,
        checksumSha256,
        uploadMethod: 'tus',
      },
    });

    // --- 8. Enqueue OCR + OpenSearch indexing ---
    try {
      const { enqueueOcrJob } = await import('@/lib/queue/redis-queue');
      await enqueueOcrJob({
        tenantId: ctx.tenantId,
        documentId: result.doc.id,
        versionId: result.version.id,
        mimeType: result.version.mimeType,
        storageKey: result.version.storageKey,
        startedBy: ctx.userId,
      });
    } catch {
      const { indexDocumentText } = await import('@/lib/documents/text-extraction');
      indexDocumentText(ctx.tenantId, result.doc.id, result.version.id).catch(() => {});
    }

    const { indexDocument: osIndexDocument } = await import('@/lib/search/opensearch-service');
    osIndexDocument(ctx.tenantId, result.doc.id).catch(() => {});

    logger.info('document.tus_upload_complete', {
      documentId: result.doc.id,
      versionId: result.version.id,
      fileName: body.fileName,
      sizeBytes: fileSize,
    });

    return NextResponse.json({
      document: result.doc,
      version: result.version,
    }, { status: 201 });
  },
);
