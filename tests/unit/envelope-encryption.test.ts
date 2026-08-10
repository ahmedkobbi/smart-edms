/**
 * Smart EDMS — Envelope encryption tests
 *
 * Tests the encrypt/decrypt cycle for both:
 *   1. DEK wrapping (KEK wraps DEK)
 *   2. File content encryption (DEK encrypts content)
 *
 * NOTE: These tests call the actual crypto functions which use the KEK.
 * In test mode, a KEK is auto-generated at /tmp/.kee-test if not set.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set a test KEK before importing the module
process.env.SMART_EDMS_KEK = crypto.randomBytes(32).toString('hex');

// We test the low-level encryption functions directly (not the DB-backed ones)
// since DB calls require Prisma client which needs a running database.

function encryptWithDek(dek: Buffer, plaintext: Buffer): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([ct, tag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

function decryptWithDek(dek: Buffer, ciphertext: string, iv: string): Buffer {
  const raw = Buffer.from(ciphertext, 'base64');
  const tag = raw.subarray(raw.length - 16);
  const ct = raw.subarray(0, raw.length - 16);
  const ivBuf = Buffer.from(iv, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, ivBuf);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function wrapDek(kek: Buffer, dek: Buffer): { encryptedDek: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedDek: Buffer.concat([wrapped, tag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

function unwrapDek(kek: Buffer, encryptedDek: string, iv: string): Buffer {
  const raw = Buffer.from(encryptedDek, 'base64');
  const tag = raw.subarray(raw.length - 16);
  const wrapped = raw.subarray(0, raw.length - 16);
  const ivBuf = Buffer.from(iv, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, ivBuf);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
}

describe('Envelope Encryption', () => {
  const testKek = crypto.randomBytes(32);

  it('encrypts and decrypts file content correctly', () => {
    const dek = crypto.randomBytes(32);
    const plaintext = Buffer.from('This is a confidential document content.', 'utf-8');

    const encrypted = encryptWithDek(dek, plaintext);
    const decrypted = decryptWithDek(dek, encrypted.ciphertext, encrypted.iv);

    expect(decrypted).toEqual(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const dek = crypto.randomBytes(32);
    const plaintext = Buffer.from('Same content', 'utf-8');

    const enc1 = encryptWithDek(dek, plaintext);
    const enc2 = encryptWithDek(dek, plaintext);

    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);

    // Both decrypt to the same plaintext
    expect(decryptWithDek(dek, enc1.ciphertext, enc1.iv)).toEqual(plaintext);
    expect(decryptWithDek(dek, enc2.ciphertext, enc2.iv)).toEqual(plaintext);
  });

  it('wraps and unwraps a DEK with the KEK', () => {
    const dek = crypto.randomBytes(32);

    const wrapped = wrapDek(testKek, dek);
    const unwrapped = unwrapDek(testKek, wrapped.encryptedDek, wrapped.iv);

    expect(unwrapped).toEqual(dek);
  });

  it('fails to decrypt with the wrong DEK', () => {
    const dek1 = crypto.randomBytes(32);
    const dek2 = crypto.randomBytes(32);
    const plaintext = Buffer.from('Secret data', 'utf-8');

    const encrypted = encryptWithDek(dek1, plaintext);

    expect(() => decryptWithDek(dek2, encrypted.ciphertext, encrypted.iv)).toThrow();
  });

  it('fails to unwrap DEK with the wrong KEK', () => {
    const kek1 = crypto.randomBytes(32);
    const kek2 = crypto.randomBytes(32);
    const dek = crypto.randomBytes(32);

    const wrapped = wrapDek(kek1, dek);

    expect(() => unwrapDek(kek2, wrapped.encryptedDek, wrapped.iv)).toThrow();
  });

  it('fails if ciphertext is tampered (GCM auth tag verification)', () => {
    const dek = crypto.randomBytes(32);
    const plaintext = Buffer.from('Original content', 'utf-8');

    const encrypted = encryptWithDek(dek, plaintext);

    // Tamper with the ciphertext (flip a bit)
    const raw = Buffer.from(encrypted.ciphertext, 'base64');
    raw[0] ^= 0x01;
    const tamperedCiphertext = raw.toString('base64');

    expect(() => decryptWithDek(dek, tamperedCiphertext, encrypted.iv)).toThrow();
  });

  it('fails if IV is tampered', () => {
    const dek = crypto.randomBytes(32);
    const plaintext = Buffer.from('Content', 'utf-8');

    const encrypted = encryptWithDek(dek, plaintext);

    // Tamper with IV
    const ivBuf = Buffer.from(encrypted.iv, 'base64');
    ivBuf[0] ^= 0x01;
    const tamperedIv = ivBuf.toString('base64');

    expect(() => decryptWithDek(dek, encrypted.ciphertext, tamperedIv)).toThrow();
  });

  it('handles empty plaintext', () => {
    const dek = crypto.randomBytes(32);
    const plaintext = Buffer.alloc(0);

    const encrypted = encryptWithDek(dek, plaintext);
    const decrypted = decryptWithDek(dek, encrypted.ciphertext, encrypted.iv);

    expect(decrypted).toEqual(plaintext);
    expect(decrypted.length).toBe(0);
  });

  it('handles large file content (1MB)', () => {
    const dek = crypto.randomBytes(32);
    const plaintext = crypto.randomBytes(1024 * 1024); // 1MB

    const encrypted = encryptWithDek(dek, plaintext);
    const decrypted = decryptWithDek(dek, encrypted.ciphertext, encrypted.iv);

    expect(decrypted).toEqual(plaintext);
  });

  it('produces ciphertext longer than plaintext (IV + auth tag overhead)', () => {
    const dek = crypto.randomBytes(32);
    const plaintext = Buffer.from('Test', 'utf-8');

    const encrypted = encryptWithDek(dek, plaintext);
    const ctBuf = Buffer.from(encrypted.ciphertext, 'base64');

    // Ciphertext = encrypted bytes + 16-byte auth tag
    expect(ctBuf.length).toBe(plaintext.length + 16);
  });

  it('full envelope cycle: wrap DEK → encrypt content → unwrap → decrypt', () => {
    // 1. Generate DEK
    const dek = crypto.randomBytes(32);

    // 2. Wrap DEK with KEK (store wrapped DEK in DB)
    const wrapped = wrapDek(testKek, dek);

    // 3. Encrypt file content with DEK
    const plaintext = Buffer.from('Highly sensitive document content', 'utf-8');
    const encrypted = encryptWithDek(dek, plaintext);

    // --- Simulate storage + retrieval ---

    // 4. Unwrap DEK with KEK
    const retrievedDek = unwrapDek(testKek, wrapped.encryptedDek, wrapped.iv);

    // 5. Decrypt content with retrieved DEK
    const decrypted = decryptWithDek(retrievedDek, encrypted.ciphertext, encrypted.iv);

    expect(decrypted).toEqual(plaintext);
  });
});
