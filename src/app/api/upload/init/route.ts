/**
 * Smart EDMS — Resumable upload initialization
 * POST /api/upload/init
 *
 * Starts a resumable upload session for large files (>100MB).
 * Returns an uploadId that the client uses to upload chunks.
 *
 * Flow:
 *   1. POST /api/upload/init         → { uploadId }
 *   2. POST /api/upload/chunk        → upload each chunk (multipart)
 *   3. POST /api/upload/complete     → assemble + create document
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { randomToken } from '@/lib/auth/crypto';

// In-memory upload session store (production: Redis)
interface UploadSession {
  uploadId: string;
  tenantId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  title: string;
  description: string;
  documentType: string;
  classificationId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  retentionScheduleId: string | null;
  chunks: Map<number, Buffer>;
  totalChunks: number;
  receivedChunks: number;
  createdAt: number;
}

const uploadSessions = new Map<string, UploadSession>();

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_CREATE,
    rateLimit: { max: 10, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx) => {
    const body = await req.json();

    if (!body.fileName || !body.fileSize) {
      throw ApiError.badRequest('missing_fields', 'fileName and fileSize are required');
    }

    if (body.fileSize > 500 * 1024 * 1024) {
      throw ApiError.badRequest('file_too_large', 'Maximum file size is 500MB for resumable uploads');
    }

    const uploadId = randomToken(16);
    const chunkSize = 5 * 1024 * 1024; // 5MB per chunk
    const totalChunks = Math.ceil(body.fileSize / chunkSize);

    uploadSessions.set(uploadId, {
      uploadId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      fileName: body.fileName,
      fileSize: body.fileSize,
      mimeType: body.mimeType || 'application/octet-stream',
      title: body.title || body.fileName,
      description: body.description || '',
      documentType: body.documentType || 'generic',
      classificationId: body.classificationId || null,
      tags: body.tags || [],
      metadata: body.metadata || {},
      retentionScheduleId: body.retentionScheduleId || null,
      chunks: new Map(),
      totalChunks,
      receivedChunks: 0,
      createdAt: Date.now(),
    });

    // Clean expired sessions (30 min)
    const now = Date.now();
    for (const [id, session] of uploadSessions.entries()) {
      if (now - session.createdAt > 30 * 60 * 1000) {
        uploadSessions.delete(id);
      }
    }

    return NextResponse.json({
      uploadId,
      chunkSize,
      totalChunks,
    });
  },
);

export { uploadSessions, UploadSession };
