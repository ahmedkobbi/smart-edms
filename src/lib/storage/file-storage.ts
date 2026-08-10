/**
 * Smart EDMS — Pluggable object storage abstraction
 *
 * Two adapters ship:
 *   1. LocalFileStorage — writes under STORAGE_LOCAL_ROOT (dev)
 *   2. S3FileStorage    — S3-compatible (AWS S3, MinIO, R2, etc.) for prod
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetBucketVersioningCommand,
  PutBucketVersioningCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export interface FileStorage {
  put(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string, metadata?: Record<string, string>): Promise<{ size: number; etag?: string }>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number, filename?: string): Promise<string>;
  getMetadata(key: string): Promise<{ size: number; contentType?: string } | null>;
}

export function buildStorageKey(tenantId: string, documentId: string, versionId: string, fileName: string): string {
  const safeName = sanitizeFileName(fileName);
  const rand = crypto.randomBytes(8).toString('hex');
  return `${tenantId}/${documentId}/${versionId}/${rand}/${safeName}`;
}

export function sanitizeFileName(name: string): string {
  const base = path.basename(name)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\0/g, '')
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '');
  const truncated = [...base].slice(0, 255).join('');
  return truncated || 'file';
}

class LocalFileStorage implements FileStorage {
  constructor(private root: string) {}

  private fullPath(key: string): string {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root))) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }

  async put(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string, metadata?: Record<string, string>): Promise<{ size: number; etag?: string }> {
    const fp = this.fullPath(key);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    if (Buffer.isBuffer(data)) {
      await fs.writeFile(fp, data);
      return { size: data.length };
    }
    const writeStream = (await import('fs')).createWriteStream(fp, { mode: 0o600 });
    let size = 0;
    await new Promise<void>((resolve, reject) => {
      data.on('data', (c: Buffer) => { size += c.length; });
      data.pipe(writeStream);
      data.on('error', reject);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    return { size };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.fullPath(key));
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const fsSync = await import('fs');
    return fsSync.createReadStream(this.fullPath(key));
  }

  async delete(key: string): Promise<void> {
    try { await fs.unlink(this.fullPath(key)); } catch (err: any) { if (err.code !== 'ENOENT') throw err; }
  }

  async exists(key: string): Promise<boolean> {
    try { await fs.access(this.fullPath(key)); return true; } catch { return false; }
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 60, filename?: string): Promise<string> {
    const secret = process.env.NEXTAUTH_SECRET || 'dev-only-secret';
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${key}|${exp}|${filename ?? ''}`;
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const params = new URLSearchParams({ key, exp: String(exp), sig, filename: filename ?? '' });
    return `/api/storage/resolve?${params.toString()}`;
  }

  async getMetadata(key: string): Promise<{ size: number; contentType?: string } | null> {
    try { const stat = await fs.stat(this.fullPath(key)); return { size: stat.size }; } catch { return null; }
  }
}

class S3FileStorage implements FileStorage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const region = process.env.S3_REGION || 'us-east-1';
    this.bucket = process.env.S3_BUCKET || '';
    if (!this.bucket) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
    this.client = new S3Client({
      region,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '' },
    });
  }

  async put(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string, metadata?: Record<string, string>): Promise<{ size: number; etag?: string }> {
    const body = Buffer.isBuffer(data) ? data : (await streamToBuffer(data));

    // Use multipart upload for files > 5MB (S3's minimum part size)
    // This is more reliable for large files and supports automatic retry
    const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB
    const PART_SIZE = 8 * 1024 * 1024; // 8MB parts

    if (body.length > MULTIPART_THRESHOLD) {
      return this.multipartUpload(key, body, contentType, metadata, PART_SIZE);
    }

    const sseAlgorithm = process.env.S3_KMS_KEY_ID ? 'aws:kms' : 'AES256';
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
      ServerSideEncryption: sseAlgorithm as any,
      ...(process.env.S3_KMS_KEY_ID ? { SSEKMSKeyId: process.env.S3_KMS_KEY_ID } : {}),
    });
    const out = await this.client.send(cmd);
    return { size: body.length, etag: out.ETag };
  }

  /**
   * Multipart upload for large files.
   * Splits the file into parts, uploads each independently (with retry),
   * and completes the upload. If any part fails, the entire upload is aborted.
   */
  private async multipartUpload(
    key: string,
    body: Buffer,
    contentType: string,
    metadata: Record<string, string> | undefined,
    partSize: number,
  ): Promise<{ size: number; etag?: string }> {
    const sseAlgorithm = process.env.S3_KMS_KEY_ID ? 'aws:kms' : 'AES256';

    // 1. Create multipart upload
    const createCmd = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
      ServerSideEncryption: sseAlgorithm as any,
      ...(process.env.S3_KMS_KEY_ID ? { SSEKMSKeyId: process.env.S3_KMS_KEY_ID } : {}),
    });
    const createResp = await this.client.send(createCmd);
    const uploadId = createResp.UploadId!;

    try {
      // 2. Upload each part
      const parts: { PartNumber: number; ETag: string }[] = [];
      const totalParts = Math.ceil(body.length / partSize);

      for (let i = 0; i < totalParts; i++) {
        const partNumber = i + 1;
        const start = i * partSize;
        const end = Math.min(start + partSize, body.length);
        const partData = body.subarray(start, end);

        const uploadCmd = new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          PartNumber: partNumber,
          UploadId: uploadId,
          Body: partData,
        });
        const uploadResp = await this.client.send(uploadCmd);
        parts.push({ PartNumber: partNumber, ETag: uploadResp.ETag! });
      }

      // 3. Complete multipart upload
      const completeCmd = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      });
      const completeResp = await this.client.send(completeCmd);

      return { size: body.length, etag: completeResp.ETag };
    } catch (err) {
      // Abort the multipart upload on failure (clean up parts)
      try {
        await this.client.send(new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }));
      } catch {}
      throw err;
    }
  }

  /**
   * Check if S3 bucket versioning is enabled.
   * Returns the versioning status: 'Enabled' | 'Suspended' | null
   */
  async getBucketVersioningStatus(): Promise<string | null> {
    try {
      const resp = await this.client.send(new GetBucketVersioningCommand({ Bucket: this.bucket }));
      return resp.Status || null;
    } catch {
      return null;
    }
  }

  /**
   * Enable S3 bucket versioning (if not already enabled).
   * This is a one-time setup operation — call after bucket creation.
   */
  async enableBucketVersioning(): Promise<boolean> {
    try {
      await this.client.send(new PutBucketVersioningCommand({
        Bucket: this.bucket,
        VersioningConfiguration: { Status: 'Enabled' },
      }));
      return true;
    } catch (err) {
      console.warn('[s3] failed to enable bucket versioning:', err);
      return false;
    }
  }

  async get(key: string): Promise<Buffer> {
    return streamToBuffer(await this.getStream(key));
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return out.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try { await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })); return true; } catch { return false; }
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 60, filename?: string): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: filename ? `attachment; filename="${filename.replace(/["\\]/g, '')}"` : undefined });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
  }

  async getMetadata(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: out.ContentLength ?? 0, contentType: out.ContentType };
    } catch { return null; }
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream as any) { chunks.push(typeof c === 'string' ? Buffer.from(c) : c); }
  return Buffer.concat(chunks);
}

let cachedStorage: FileStorage | null = null;

export function getFileStorage(): FileStorage {
  if (cachedStorage) return cachedStorage;
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if (driver === 's3') { cachedStorage = new S3FileStorage(); }
  else { cachedStorage = new LocalFileStorage(process.env.STORAGE_LOCAL_ROOT || '/home/z/my-project/storage'); }
  return cachedStorage;
}
