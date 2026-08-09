/**
 * Smart EDMS — Upload chunk
 * POST /api/upload/chunk
 *
 * Receives a single chunk of a resumable upload.
 * Body: multipart/form-data with fields: uploadId, chunkIndex, chunk (file)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { uploadSessions } from '../init/route';

export const POST = createApiHandler(
  {
    rateLimit: { max: 120, windowMs: 60_000 }, // 120 chunks per minute
  },
  async (req: NextRequest, ctx) => {
    const formData = await req.formData();
    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string, 10);
    const chunkFile = formData.get('chunk') as File;

    if (!uploadId || isNaN(chunkIndex) || !chunkFile) {
      throw ApiError.badRequest('missing_fields', 'uploadId, chunkIndex, and chunk are required');
    }

    const session = uploadSessions.get(uploadId);
    if (!session) {
      throw ApiError.notFound('upload_not_found', 'Upload session not found or expired');
    }

    if (session.tenantId !== ctx.tenantId || session.userId !== ctx.userId) {
      throw ApiError.forbidden('not_authorized', 'Upload session does not belong to this user');
    }

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw ApiError.badRequest('invalid_chunk', `Chunk index must be 0-${session.totalChunks - 1}`);
    }

    const chunkBuf = Buffer.from(await chunkFile.arrayBuffer());
    session.chunks.set(chunkIndex, chunkBuf);
    session.receivedChunks = session.chunks.size;

    return NextResponse.json({
      uploadId,
      chunkIndex,
      received: session.receivedChunks,
      total: session.totalChunks,
      progress: Math.round((session.receivedChunks / session.totalChunks) * 100),
    });
  },
);
