/**
 * Smart EDMS — Envelope encryption service
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { getKek } from '@/lib/auth/crypto';

export async function createDocumentDek(tenantId: string, documentId: string, tx?: any): Promise<{ dek: Buffer; keyVersion: number }> {
  const dek = crypto.randomBytes(32);
  const kek = await getKek();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedDek = Buffer.concat([wrapped, tag]).toString('base64');
  const client = tx || db;
  await client.documentEncryptionKey.create({ data: { tenantId, documentId, encryptedDek, iv: iv.toString('base64'), keyVersion: 1 } });
  return { dek, keyVersion: 1 };
}

export async function getDocumentDek(tenantId: string, documentId: string): Promise<Buffer | null> {
  const row = await db.documentEncryptionKey.findFirst({ where: { tenantId, documentId } });
  if (!row) return null;
  const kek = await getKek();
  const raw = Buffer.from(row.encryptedDek, 'base64');
  const tag = raw.subarray(raw.length - 16);
  const wrapped = raw.subarray(0, raw.length - 16);
  const iv = Buffer.from(row.iv, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
}

export function encryptWithDek(dek: Buffer, plaintext: Buffer): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([ct, tag]).toString('base64'), iv: iv.toString('base64') };
}

export function decryptWithDek(dek: Buffer, ciphertext: string, iv: string): Buffer {
  const raw = Buffer.from(ciphertext, 'base64');
  const tag = raw.subarray(raw.length - 16);
  const ct = raw.subarray(0, raw.length - 16);
  const ivBuf = Buffer.from(iv, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, ivBuf);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export async function cryptoShredDocument(tenantId: string, documentId: string): Promise<void> {
  await db.documentEncryptionKey.deleteMany({ where: { tenantId, documentId } });
}

export async function rotateWrappedDeks(tenantId: string, newKek: Buffer): Promise<{ rotated: number }> {
  const keys = await db.documentEncryptionKey.findMany({ where: { tenantId } });
  let rotated = 0;
  for (const k of keys) {
    const dek = await getDocumentDek(tenantId, k.documentId);
    if (!dek) continue;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', newKek, iv);
    const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    await db.documentEncryptionKey.update({ where: { id: k.id }, data: { encryptedDek: Buffer.concat([wrapped, tag]).toString('base64'), iv: iv.toString('base64'), keyVersion: { increment: 1 }, rotatedAt: new Date() } });
    rotated++;
  }
  return { rotated };
}
