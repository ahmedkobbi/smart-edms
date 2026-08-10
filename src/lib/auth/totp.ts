/**
 * Smart EDMS — TOTP MFA utilities
 *
 * Uses RFC 6238 TOTP (HMAC-SHA1, 30s period, 6 digits).
 * Secrets are stored AES-encrypted in the database.
 */

import * as OTPAuth from 'otpauth';
import { encryptString, decryptString, randomBase64Url, sha256, timingSafeEqualStr } from './crypto';

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

/**
 * Verify a TOTP token against the secret.
 *
 * SECURITY FIX (C6): Returns the timestep delta (not just boolean) so the
 * caller can persist it as `mfaLastTimestep` for replay protection per
 * RFC 6238 §5.2. The caller MUST reject if the returned delta is <= the
 * stored last-used timestep.
 *
 * @returns The timestep delta (0 = current period, ±1 = adjacent periods),
 *          or null if the token is invalid.
 */
export function verifyTotp(base32Secret: string, token: string, window = 1): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  const delta = totp.validate({ token, window });
  return delta; // null if invalid, number (timestep offset) if valid
}

/**
 * Compute the current TOTP timestep (epoch seconds / 30).
 * Used to persist the last-used timestep for replay protection.
 */
export function getCurrentTimestep(): number {
  return Math.floor(Date.now() / 1000 / 30);
}

/**
 * Verify a TOTP token with replay protection.
 *
 * SECURITY FIX (C6): Rejects tokens whose timestep is <= the last-used
 * timestep. This prevents replaying the same code within the ±30s window.
 *
 * @param base32Secret The decrypted TOTP secret
 * @param token The 6-digit code from the user's authenticator
 * @param lastUsedTimestep The last successfully verified timestep (from DB)
 * @param window The time window (default 1 = ±30s)
 * @returns The new timestep to persist, or null if verification failed
 */
export function verifyTotpWithReplay(
  base32Secret: string,
  token: string,
  lastUsedTimestep: number | null,
  window = 1,
): number | null {
  const delta = verifyTotp(base32Secret, token, window);
  if (delta === null) return null;

  // Compute the absolute timestep of this verification
  const currentTimestep = getCurrentTimestep();
  const usedTimestep = currentTimestep + delta;

  // Replay protection: reject if this timestep was already used
  if (lastUsedTimestep !== null && usedTimestep <= lastUsedTimestep) {
    return null; // Replay attempt — same or older timestep
  }

  return usedTimestep;
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
 *
 * DEPRECATED — kept for backwards-compatibility only. New code should use
 * `hashBackupCodes` instead, which stores one-way SHA-256 hashes. Backup
 * codes are short single-use authenticators (like passwords) and should
 * never be reversibly encrypted — a KEK leak + DB dump would otherwise
 * recover every user's backup codes. See SECURITY FIX (M-AUTH-6).
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

/**
 * SECURITY FIX (M-AUTH-6): Hash backup codes with SHA-256 (one-way).
 *
 * Backup codes are short single-use authenticators, analogous to passwords.
 * Reversible encryption (the previous scheme) means anyone with the KEK and
 * DB read access can recover every user's backup codes — defeating the
 * purpose of having a second factor at all. One-way hashing matches the
 * threat model: the codes are only ever verified, never displayed again
 * after generation.
 *
 * The stored JSON is `string[]` of hex SHA-256 hashes, then AES-encrypted
 * with the tenant KEK as a defense-in-depth measure (so the hashes are
 * not directly exposed by a raw SQL dump either).
 */
export async function hashBackupCodes(codes: string[]): Promise<string> {
  const hashes = codes.map((c) => sha256(c));
  const blob = await encryptString(JSON.stringify(hashes));
  return JSON.stringify(blob);
}

/**
 * Verify a user-supplied backup code against the stored hashes, and
 * atomically remove the consumed code so it cannot be reused.
 *
 * Returns `{ valid, remaining }` where `remaining` is the updated list of
 * hashes (excluding the consumed one). The caller MUST persist `remaining`
 * back to `mfaBackupCodesEnc` on success — otherwise the consumed code
 * remains valid.
 */
export async function verifyAndConsumeBackupCode(
  encrypted: string,
  submittedCode: string,
): Promise<{ valid: boolean; remaining?: string }> {
  let hashes: string[];
  try {
    const blob = JSON.parse(encrypted);
    const json = await decryptString(blob);
    hashes = JSON.parse(json);
  } catch {
    return { valid: false };
  }

  const submittedHash = sha256(submittedCode);
  let matchedIndex = -1;
  for (let i = 0; i < hashes.length; i++) {
    if (timingSafeEqualStr(submittedHash, hashes[i])) {
      matchedIndex = i;
      break;
    }
  }
  if (matchedIndex === -1) return { valid: false };

  // Remove the consumed code
  hashes.splice(matchedIndex, 1);
  const blob = await encryptString(JSON.stringify(hashes));
  return { valid: true, remaining: JSON.stringify(blob) };
}
