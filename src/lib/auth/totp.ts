/**
 * Smart EDMS — TOTP MFA utilities
 *
 * Uses RFC 6238 TOTP (HMAC-SHA1, 30s period, 6 digits).
 * Secrets are stored AES-encrypted in the database.
 */

import * as OTPAuth from 'otpauth';
import { encryptString, decryptString, randomBase64Url } from './crypto';

const ISSUER = 'Smart EDMS';

export function generateTotpSecret(email: string): { secret: string; uri: string } {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export async function encryptTotpSecret(base32Secret: string): Promise<string> {
  const blob = await encryptString(base32Secret);
  return JSON.stringify(blob);
}

export async function decryptTotpSecret(encrypted: string): Promise<string> {
  const blob = JSON.parse(encrypted);
  return decryptString(blob);
}

export function verifyTotp(base32Secret: string, token: string, window = 1): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  const delta = totp.validate({ token, window });
  return delta !== null;
}

/**
 * Generate 10 single-use backup codes (8 chars each, base32-style).
 * Returns them in plain text ONE TIME — caller must hash before persisting.
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(randomBase64Url(5).toUpperCase().replace(/[_-]/g, '').padEnd(8, 'X').slice(0, 8));
  }
  return codes;
}

/**
 * Encrypt the JSON array of backup codes for storage.
 */
export async function encryptBackupCodes(codes: string[]): Promise<string> {
  const blob = await encryptString(JSON.stringify(codes));
  return JSON.stringify(blob);
}

export async function decryptBackupCodes(encrypted: string): Promise<string[]> {
  const blob = JSON.parse(encrypted);
  const json = await decryptString(blob);
  return JSON.parse(json);
}
