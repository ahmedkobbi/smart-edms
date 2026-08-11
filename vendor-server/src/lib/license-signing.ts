/**
 * Smart EDMS Vendor Server — License Signing Library
 *
 * Uses Ed25519 asymmetric cryptography. The PRIVATE key lives ONLY on this
 * server (in the environment). The on-prem customer server has ONLY the
 * public key — it can verify licenses but CANNOT generate them.
 *
 * This is the crown jewel of the licensing system. If this key is compromised,
 * all licenses can be forged. The key should be:
 *   1. Generated once using `bun run src/gen-keys.ts`
 *   2. Stored in the VENDOR_ED25519_PRIVATE_KEY environment variable
 *   3. NEVER committed to git, NEVER logged, NEVER sent to any client
 */

import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from 'crypto';
import { randomBytes } from 'crypto';

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

/**
 * Generate a new Ed25519 key pair.
 * Run this ONCE to create your vendor keys.
 * Store the private key in VENDOR_ED25519_PRIVATE_KEY env var.
 * Embed the public key in the on-prem app (in anti-crack.ts).
 */
export function generateEd25519KeyPair(): { privateKeyPem: string; publicKeyPem: string; publicKeyBase64: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  // Also export public key as base64 for embedding in the on-prem app
  const publicKeyBase64 = Buffer.from(publicKey).toString('base64');

  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    publicKeyBase64,
  };
}

/**
 * Get the private key from the environment.
 * Throws if not configured — the server cannot issue licenses without it.
 */
function getPrivateKey(): string {
  const key = process.env.VENDOR_ED25519_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      'VENDOR_ED25519_PRIVATE_KEY is not set. Run `bun run src/gen-keys.ts` to generate keys.'
    );
  }
  return key;
}

/**
 * Get the public key (for verification and for embedding in on-prem apps).
 */
export function getPublicKey(): string {
  const key = process.env.VENDOR_ED25519_PUBLIC_KEY;
  if (!key) {
    throw new Error('VENDOR_ED25519_PUBLIC_KEY is not set.');
  }
  return key;
}

// ============================================================================
// LICENSE PAYLOAD
// ============================================================================

export interface LicensePayload {
  tenantId: string;
  tenantName: string;
  plan: string;
  seats: number;
  storageBytes: string; // BigInt as string for JSON serialization
  features: string[];
  issuedAt: string;    // ISO date
  expiresAt: string;   // ISO date
  gracePeriodDays: number;
  issuedBy: string;
  nonce: string;       // Unique per license (replay protection)
  version: string;     // License format version
}

// ============================================================================
// LICENSE SIGNING
// ============================================================================

/**
 * Sign a license payload with the Ed25519 private key.
 * Returns the base64-encoded signature.
 *
 * SECURITY: This function is ONLY callable on the vendor server.
 * The on-prem customer server NEVER has the private key.
 */
export function signLicense(payload: LicensePayload): string {
  const privateKeyPem = getPrivateKey();
  const privateKeyObj = createPrivateKey(privateKeyPem);

  // Canonical JSON (sorted keys) for deterministic signing
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());

  const signature = sign(null, Buffer.from(canonical, 'utf-8'), privateKeyObj);
  return signature.toString('base64');
}

/**
 * Verify a license signature using the Ed25519 public key.
 * This function is ALSO available on the on-prem server (which has only the public key).
 */
export function verifyLicenseSignature(payload: LicensePayload, signature: string): boolean {
  try {
    const publicKeyPem = getPublicKey();
    const publicKeyObj = createPublicKey(publicKeyPem);

    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const sigBuffer = Buffer.from(signature, 'base64');
    const dataBuffer = Buffer.from(canonical, 'utf-8');

    return verify(null, dataBuffer, publicKeyObj, sigBuffer);
  } catch {
    return false;
  }
}

// ============================================================================
// LICENSE KEY GENERATION
// ============================================================================

/**
 * Generate a complete license key (base64-encoded JSON with payload + signature).
 * This is what the vendor sends to the customer.
 * The customer uploads it via the on-prem admin UI.
 */
export function generateLicenseKey(input: {
  tenantId: string;
  tenantName: string;
  plan?: string;
  seats?: number;
  storageBytes?: bigint;
  features?: string[];
  expiresAt: Date;
  gracePeriodDays?: number;
  issuedBy: string;
}): { licenseKey: string; payload: LicensePayload; signature: string } {
  const nonce = randomBytes(16).toString('hex');

  const payload: LicensePayload = {
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    plan: input.plan || 'enterprise',
    seats: input.seats || 25,
    storageBytes: (input.storageBytes || BigInt(5 * 1024 * 1024 * 1024)).toString(),
    features: input.features || ['records_management', 'signatures', 'bpmn_designer', 'security_audit'],
    issuedAt: new Date().toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    gracePeriodDays: input.gracePeriodDays || 30,
    issuedBy: input.issuedBy,
    nonce,
    version: '2.0', // Ed25519 signed (v1 was HMAC)
  };

  const signature = signLicense(payload);

  const licenseObject = { ...payload, signature };
  const licenseKey = Buffer.from(JSON.stringify(licenseObject)).toString('base64');

  return { licenseKey, payload, signature };
}

/**
 * Parse a license key back to the payload + signature.
 * Throws if the key is malformed or the signature is invalid.
 */
export function parseLicenseKey(licenseKey: string): LicensePayload & { signature: string } {
  const decoded = Buffer.from(licenseKey, 'base64').toString('utf-8');
  const parsed = JSON.parse(decoded);

  const { signature, ...payload } = parsed;

  if (!verifyLicenseSignature(payload as LicensePayload, signature)) {
    throw new Error('Invalid license signature — license may have been tampered with');
  }

  return { ...payload, signature } as LicensePayload & { signature: string };
}

/**
 * Generate a random nonce for replay protection.
 */
export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}
