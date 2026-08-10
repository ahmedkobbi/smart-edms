/**
 * Smart EDMS — Storage resolve endpoint (local-storage mode)
 *
 * Serves files from the local filesystem using HMAC-signed URLs generated
 * by `LocalFileStorage.getSignedDownloadUrl()`.
 *
 * The signed URL contains:
 *   - key: the storage key (tenantId/documentId/versionId/rand/filename)
 *   - exp: unix-seconds expiry
 *   - sig: HMAC-SHA256(key|exp|filename, NEXTAUTH_SECRET)
 *   - filename: optional download filename
 *
 * This route verifies the signature, checks expiry, and streams the file
 * with the correct Content-Type and Content-Disposition headers.
 *
 * In S3 mode, this route is NOT used — S3 presigned URLs point directly
 * to the S3 endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { logger } from '@/lib/config/logger';

const STORAGE_ROOT = process.env.STORAGE_LOCAL_ROOT || '/home/z/my-project/storage';
const MAX_signed_URL_EXPIRY = 3600; // 1 hour hard cap

/**
 * MIME type mapping for common document types.
 * Used when the file extension is known but Content-Type wasn't stored.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  htm: 'text/html',
  xml: 'application/xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  zip: 'application/zip',
  msg: 'application/vnd.ms-outlook',
  eml: 'message/rfc822',
};

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXTENSION[ext] || 'application/octet-stream';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // SECURITY FIX (M-DOC-7): Support two envelope modes:
  //   (a) Local-storage envelope: ?key=&exp=&sig=&filename=&u=
  //   (b) S3 wrapped envelope: ?s3=1&url=&exp=&sig=&u=
  const isS3 = url.searchParams.get('s3') === '1';
  const signedUserId = url.searchParams.get('u') || '';

  // If the URL was issued with a user binding (u=...), verify the requesting
  // session matches. Public shares omit `u` and remain bearer tokens.
  if (signedUserId) {
    const { getServerSession } = await import('@/lib/auth/auth-options');
    const session = await getServerSession();
    if (!session?.user || session.user.id !== signedUserId) {
      return NextResponse.json(
        { error: { code: 'forbidden', message: 'This download link is bound to another user session.' } },
        { status: 403 },
      );
    }
  }

  if (isS3) {
    // S3 wrapped envelope — proxy the bytes through this endpoint so the
    // S3 presigned URL is never exposed to the client.
    const innerUrl = url.searchParams.get('url') || '';
    const expStr = url.searchParams.get('exp') || '';
    const sig = url.searchParams.get('sig') || '';
    if (!innerUrl || !expStr || !sig) {
      return NextResponse.json({ error: { code: 'invalid_request' } }, { status: 400 });
    }
    const exp = parseInt(expStr, 10);
    if (isNaN(exp) || Math.floor(Date.now() / 1000) > exp) {
      return NextResponse.json({ error: { code: 'link_expired' } }, { status: 410 });
    }
    const secret = process.env.NEXTAUTH_SECRET || 'dev-only-secret';
    const expectedSig = crypto.createHmac('sha256', secret)
      .update(`${encodeURIComponent(innerUrl)}|${exp}|${signedUserId}`)
      .digest('hex');
    try {
      if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
        return NextResponse.json({ error: { code: 'invalid_signature' } }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: { code: 'invalid_signature' } }, { status: 403 });
    }
    // Fetch from S3 and stream back to the client
    const upstream = await fetch(innerUrl, { signal: AbortSignal.timeout(60_000) });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: { code: 'upstream_failed' } }, { status: 502 });
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentDisp = upstream.headers.get('content-disposition') || 'attachment';
    return new NextResponse(upstream.body as any, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisp,
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    });
  }

  // Local-storage envelope
  const key = url.searchParams.get('key');
  const expStr = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  const filename = url.searchParams.get('filename') || '';

  if (!key || !expStr || !sig) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Missing required parameters' } },
      { status: 400 },
    );
  }

  const exp = parseInt(expStr, 10);
  if (isNaN(exp)) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Invalid expiry' } },
      { status: 400 },
    );
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (now > exp) {
    logger.warn('storage.resolve.expired', { key, exp, now });
    return NextResponse.json(
      { error: { code: 'link_expired', message: 'This download link has expired' } },
      { status: 410 },
    );
  }

  // Verify HMAC signature (constant-time compare)
  // SECURITY FIX (M-DOC-7): Two payload formats are accepted:
  //   - Legacy (no `u` param): `${key}|${exp}|${filename}` — backward compat
  //     for URLs issued before M-DOC-7 and for public shares that are
  //     intentionally bearer tokens.
  //   - Bound (`u` param present): `${key}|${exp}|${filename}|${u}` — the
  //     session user must match `u`. New signed URLs use this format.
  const secret = process.env.NEXTAUTH_SECRET || 'dev-only-secret';
  const payload = signedUserId
    ? `${key}|${exp}|${filename}|${signedUserId}`
    : `${key}|${exp}|${filename}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  if (sig.length !== expectedSig.length) {
    logger.warn('storage.resolve.sig_length_mismatch', { key });
    return NextResponse.json(
      { error: { code: 'invalid_signature', message: 'Invalid signature' } },
      { status: 403 },
    );
  }
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      logger.warn('storage.resolve.sig_mismatch', { key });
      return NextResponse.json(
        { error: { code: 'invalid_signature', message: 'Invalid signature' } },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: { code: 'invalid_signature', message: 'Invalid signature' } },
      { status: 403 },
    );
  }

  // Resolve the file path with path-traversal prevention
  const resolvedRoot = path.resolve(STORAGE_ROOT);
  const resolvedPath = path.resolve(resolvedRoot, key);
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    logger.warn('storage.resolve.path_traversal', { key, resolvedPath });
    return NextResponse.json(
      { error: { code: 'invalid_key', message: 'Invalid storage key' } },
      { status: 400 },
    );
  }

  // Check file exists
  try {
    await fs.access(resolvedPath);
  } catch {
    logger.warn('storage.resolve.not_found', { key });
    return NextResponse.json(
      { error: { code: 'not_found', message: 'File not found' } },
      { status: 404 },
    );
  }

  // Determine Content-Type
  const baseName = filename || path.basename(resolvedPath);
  const contentType = getMimeType(baseName);

  // Build Content-Disposition
  // Sanitize filename for the header (RFC 6266)
  const safeName = baseName.replace(/["\\;\r\n]/g, '').slice(0, 255);
  const disposition = `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;

  // Stream the file
  try {
    const stream = createReadStream(resolvedPath);
    const readableWebStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

    return new NextResponse(readableWebStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    });
  } catch (err) {
    logger.error('storage.resolve.stream_failed', { key, error: (err as Error).message });
    return NextResponse.json(
      { error: { code: 'stream_failed', message: 'Failed to stream file' } },
      { status: 500 },
    );
  }
}
