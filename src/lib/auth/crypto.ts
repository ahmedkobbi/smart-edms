/**
 * Smart EDMS — Cryptographic primitives
 *
 * Uses Node's built-in crypto. No custom crypto implementations.
 *
 * Security notes:
 *  - Password hashing: Argon2id (memory-hard)
 *  - TOTP secret storage: AES-256-GCM with a key derived from KEK env var
 *  - Audit hash chain: SHA-256
 *  - Random tokens: crypto.randomBytes (CSPRNG)
 */

import crypto from 'crypto';
import argon2 from 'argon2';
import { promises as fs } from 'fs';
import path from 'path';

const ENCRYPTION_KEY_ENV = 'SMART_EDMS_KEK';
const FALLBACK_KEK_PATH = '/home/z/my-project/.kek';

let cachedKek: Buffer | null = null;

/**
 * Returns the 32-byte Key Encryption Key (KEK) used for envelope encryption
 * of MFA secrets and other small sensitive values stored in the DB.
 *
 * Resolution order:
 *   1. process.env.SMART_EDMS_KEK (hex or base64, 32 bytes)
 *   2. On-disk fallback key (auto-generated, dev only)
 *
 * In production deployments this MUST be supplied via env / KMS / HSM.
 */
export async function getKek(): Promise<Buffer> {
  if (cachedKek) return cachedKek;

  const envVal = process.env[ENCRYPTION_KEY_ENV];
  if (envVal) {
    let buf: Buffer;
    if (/^[0-9a-fA-F]+$/.test(envVal) && envVal.length === 64) {
      buf = Buffer.from(envVal, 'hex');
    } else {
      buf = Buffer.from(envVal, 'base64');
    }
    if (buf.length !== 32) {
      throw new Error('SMART_EDMS_KEK must be 32 bytes (hex or base64)');
    }
    cachedKek = buf;
    return buf;
  }

  // Dev fallback: auto-generate and persist a key on disk.
  try {
    const existing = await fs.readFile(FALLBACK_KEK_PATH);
    if (existing.length === 32) {
      cachedKek = existing;
      return existing;
    }
  } catch {
    // ignore — file doesn't exist yet
  }
  const newKey = crypto.randomBytes(32);
  await fs.mkdir(path.dirname(FALLBACK_KEK_PATH), { recursive: true });
  await fs.writeFile(FALLBACK_KEK_PATH, newKey, { mode: 0o600 });
  cachedKek = newKey;
  return newKey;
}

// ---------------------------------------------------------------------------
//  Password hashing (Argon2id)
// ---------------------------------------------------------------------------

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
//  Symmetric encryption (AES-256-GCM) — for MFA secrets, API keys, etc.
// ---------------------------------------------------------------------------

export interface EncryptedBlob {
  iv: string; // base64
  ct: string; // base64 (ciphertext + auth tag)
}

export async function encryptString(plain: string): Promise<EncryptedBlob> {
  const kek = await getKek();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ct: Buffer.concat([ct, tag]).toString('base64'),
  };
}

export async function decryptString(blob: EncryptedBlob): Promise<string> {
  const kek = await getKek();
  const raw = Buffer.from(blob.ct, 'base64');
  const tag = raw.subarray(raw.length - 16);
  const ct = raw.subarray(0, raw.length - 16);
  const iv = Buffer.from(blob.iv, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}

// ---------------------------------------------------------------------------
//  Hashing utilities (SHA-256)
// ---------------------------------------------------------------------------

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function sha1(input: string | Buffer): string {
  return crypto.createHash('sha1').update(input).digest('hex');
}

export function streamToHash(
  stream: NodeJS.ReadableStream,
  algorithm: 'sha256' | 'sha1' = 'sha256',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
//  Random tokens
// ---------------------------------------------------------------------------

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomBytes(bytes = 16): Buffer {
  return crypto.randomBytes(bytes);
}

export function randomBase64Url(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Constant-time string comparison (for token equality checks).
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
