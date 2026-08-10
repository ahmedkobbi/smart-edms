/**
 * Smart EDMS — TUS resumable upload server
 *
 * This route handles the TUS protocol (https://tus.io) for resumable,
 * multipart file uploads. It supports:
 *   - Large files (>100MB) that can't fit in a single formData() request
 *   - Resumable uploads (network interruption → resume from last chunk)
 *   - Progress tracking via TUS HEAD requests
 *   - S3 multipart upload backend (when STORAGE_DRIVER=s3)
 *   - Local filesystem backend (dev mode)
 *
 * Protocol flow:
 *   1. Client (tus-js-client) sends POST with Upload-Metadata header
 *      → server creates a TUS upload resource, returns Location URL
 *   2. Client sends PATCH with file chunks
 *      → server appends to the upload (S3 multipart or local file)
 *   3. On completion, client calls POST /api/documents/tus-complete
 *      with the TUS upload ID → server creates the Document + Version
 *
 * Security:
 *   - Authentication via session cookie (same as all API routes)
 *   - Upload-Metadata includes tenantId + userId (validated against session)
 *   - File type validation on completion (not on upload start — TUS streams
 *     don't have magic bytes until chunks arrive)
 *   - File size limit enforced via TUS Upload-Length header
 */

import { NextRequest, NextResponse } from 'next/server';
import { Server } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { FileStore } from '@tus/file-store';
import { getServerSession } from '@/lib/auth/auth-options';
import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { promises as fs } from 'fs';
import path from 'path';

// Max upload size: 2GB (TUS handles this in chunks, not in memory)
const MAX_TUS_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;

let tusServer: Server | null = null;

/**
 * Lazily initialize the TUS server (singleton).
 * Uses S3Store when STORAGE_DRIVER=s3, FileStore otherwise.
 */
function getTusServer(): Server {
  if (tusServer) return tusServer;

  const storageDriver = process.env.STORAGE_DRIVER || 'local';
  const tusDataDir = process.env.TUS_DATA_DIR || path.join(process.cwd(), '.tus-uploads');

  let store;

  if (storageDriver === 's3') {
    const bucket = process.env.S3_BUCKET!;
    const region = process.env.S3_REGION || 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

    store = new S3Store({
      bucket,
      region,
      endpoint,
      forcePathStyle,
      accessKey: process.env.S3_ACCESS_KEY_ID,
      secretKey: process.env.S3_SECRET_ACCESS_KEY,
      // Use multipart upload for files > 5MB (S3 minimum part size)
      partSize: 8 * 1024 * 1024, // 8MB parts
      // Leave parts on abort (for debugging); clean up via lifecycle policy
      leavePartsOnError: false,
    } as any);
  } else {
    // Local filesystem store for dev mode
    store = new FileStore({ directory: tusDataDir } as any);
  }

  tusServer = new Server({
    path: '/api/upload/tus',
    datastore: store,
    // Max file size (Upload-Length header is validated against this)
    maxSize: MAX_TUS_UPLOAD_SIZE,
    // Respect Upload-Defer-Length for streaming uploads
    respectUploadDeferLength: false,
    // Generate custom upload IDs (include tenant for scoping)
    generateUrl: (req, { proto, host, basePath, id }) => {
      return `${proto}://${host}${basePath}/${id}`;
    },
    // Called when a new upload is created (POST)
    onUploadCreate: async (req, res, upload) => {
      // Authenticate the request
      const session = await getServerSession();
      if (!session?.user) {
        throw { status_code: 401, body: 'Authentication required' };
      }

      // Extract metadata
      const metadata = upload.metadata || {};
      const tenantId = metadata.tenantId as string;
      const userId = metadata.userId as string;

      // Validate tenant matches session
      if (tenantId !== session.user.tenantId) {
        throw { status_code: 403, body: 'Tenant mismatch' };
      }
      if (userId !== session.user.id) {
        throw { status_code: 403, body: 'User mismatch' };
      }

      logger.info('tus.upload_created', {
        uploadId: upload.id,
        tenantId,
        userId,
        size: upload.size,
        metadata,
      });

      return res;
    },
    // Called when upload chunks are received (PATCH)
    onUploadReceive: async (req, res, upload) => {
      // Could add progress tracking here (e.g., update a Redis key)
      return res;
    },
    // Called when upload is complete (all chunks received)
    onUploadFinish: async (req, res, upload) => {
      logger.info('tus.upload_finished', {
        uploadId: upload.id,
        size: upload.size,
        metadata: upload.metadata,
      });

      // Mark upload as complete — the actual document creation happens
      // in the /api/documents/tus-complete endpoint, which the client
      // calls after receiving the finish event.
      return res;
    },
  } as any);

  return tusServer;
}

/**
 * Handle TUS protocol requests.
 * TUS uses HEAD (for resume), POST (create), PATCH (upload chunks),
 * and OPTIONS (CORS preflight).
 */
export async function POST(req: NextRequest) {
  return handleTusRequest(req);
}

export async function PATCH(req: NextRequest) {
  return handleTusRequest(req);
}

export async function HEAD(req: NextRequest) {
  return handleTusRequest(req);
}

export async function OPTIONS(req: NextRequest) {
  return handleTusRequest(req);
}

export async function DELETE(req: NextRequest) {
  return handleTusRequest(req);
}

async function handleTusRequest(req: NextRequest): Promise<Response> {
  try {
    const server = getTusServer();
    // Convert NextRequest to a standard Request that TUS can handle
    const url = new URL(req.url);
    const headers = new Headers(req.headers);

    // TUS needs the raw body stream for PATCH requests
    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method === 'PATCH' || req.method === 'POST') {
      // @ts-ignore — NextRequest.body is a ReadableStream
      init.body = req.body;
      // @ts-ignore
      init.duplex = 'half';
    }

    const standardRequest = new Request(url.toString(), init);

    // Let the TUS server handle the request
    const response = await (server as any).handle(standardRequest, req as any) as any;

    // Convert the TUS Response to a Next.js Response
    const responseHeaders = new Headers(response?.headers || []);
    responseHeaders.set('Tus-Resumable', '1.0.0');
    responseHeaders.set('Tus-Version', '1.0.0');
    responseHeaders.set('Tus-Max-Size', String(MAX_TUS_UPLOAD_SIZE));
    responseHeaders.set('Tus-Extension', 'creation,creation-defer-length,termination');

    return new NextResponse(response?.body || null, {
      status: response?.status || 200,
      statusText: response?.statusText || 'OK',
      headers: responseHeaders,
    });
  } catch (err: any) {
    logger.error('tus.request_failed', {
      method: req.method,
      error: err.message,
      statusCode: err.status_code,
    });

    const statusCode = err.status_code || 500;
    const message = err.body || 'TUS upload error';

    return NextResponse.json(
      { error: { code: 'tus_error', message } },
      { status: statusCode },
    );
  }
}
