import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from 'crypto';

describe('Ed25519 Key Pair — End-to-End License Signing', () => {
  // The actual key pair generated on 2026-08-12
  const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIC52/Af6A0MW+YaBhmOuFU5b0Ut+3PJR4dPle7GhU1tF
-----END PRIVATE KEY-----`;

  const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA5ovMYn22Om0x+uPQlRMojE7EdUAcGZWzXMdVpROQkR0=
-----END PUBLIC KEY-----`;

  const sampleLicensePayload = JSON.stringify({
    tenantId: 'test-tenant-001',
    tenantName: 'Acme Corporation',
    plan: 'enterprise',
    seats: 50,
    storageBytes: '107374182400',
    features: ['records_management', 'signatures', 'bpmn_designer', 'security_audit'],
    issuedAt: '2026-08-12T00:00:00.000Z',
    expiresAt: '2027-08-12T00:00:00.000Z',
    gracePeriodDays: 30,
    issuedBy: 'Ahmed Kobbi',
    nonce: 'abc123def456',
    version: '2.0',
  });

  it('private key can sign', () => {
    const privateKeyObj = createPrivateKey(PRIVATE_KEY_PEM);
    const signature = sign(null, Buffer.from(sampleLicensePayload, 'utf-8'), privateKeyObj);
    expect(signature).toBeTruthy();
    expect(signature.length).toBeGreaterThan(60); // Ed25519 signatures are 64 bytes
  });

  it('public key can verify the signature', () => {
    const privateKeyObj = createPrivateKey(PRIVATE_KEY_PEM);
    const signature = sign(null, Buffer.from(sampleLicensePayload, 'utf-8'), privateKeyObj);

    const publicKeyObj = createPublicKey(PUBLIC_KEY_PEM);
    const isValid = verify(null, Buffer.from(sampleLicensePayload, 'utf-8'), publicKeyObj, signature);
    expect(isValid).toBe(true);
  });

  it('public key rejects a tampered payload', () => {
    const privateKeyObj = createPrivateKey(PRIVATE_KEY_PEM);
    const signature = sign(null, Buffer.from(sampleLicensePayload, 'utf-8'), privateKeyObj);

    // Tamper with the payload
    const tamperedPayload = sampleLicensePayload.replace('"enterprise"', '"trial"');
    const publicKeyObj = createPublicKey(PUBLIC_KEY_PEM);
    const isValid = verify(null, Buffer.from(tamperedPayload, 'utf-8'), publicKeyObj, signature);
    expect(isValid).toBe(false);
  });

  it('public key rejects a forged signature', () => {
    const forgedSignature = Buffer.alloc(64, 0); // All zeros — definitely not valid
    const publicKeyObj = createPublicKey(PUBLIC_KEY_PEM);
    const isValid = verify(null, Buffer.from(sampleLicensePayload, 'utf-8'), publicKeyObj, forgedSignature);
    expect(isValid).toBe(false);
  });

  it('can generate a base64 license key and verify it back', () => {
    // Simulate the full flow: vendor signs → customer verifies
    const privateKeyObj = createPrivateKey(PRIVATE_KEY_PEM);
    const payload = JSON.parse(sampleLicensePayload);
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const signature = sign(null, Buffer.from(canonical, 'utf-8'), privateKeyObj).toString('base64');

    // Build the license key (base64 JSON with payload + signature)
    const licenseObject = { ...payload, signature };
    const licenseKey = Buffer.from(JSON.stringify(licenseObject)).toString('base64');

    // Customer parses and verifies
    const decoded = Buffer.from(licenseKey, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    const { signature: parsedSig, ...parsedPayload } = parsed;
    const parsedCanonical = JSON.stringify(parsedPayload, Object.keys(parsedPayload).sort());

    const publicKeyObj = createPublicKey(PUBLIC_KEY_PEM);
    const isValid = verify(
      null,
      Buffer.from(parsedCanonical, 'utf-8'),
      publicKeyObj,
      Buffer.from(parsedSig, 'base64'),
    );

    expect(isValid).toBe(true);
    expect(parsedPayload.tenantName).toBe('Acme Corporation');
    expect(parsedPayload.plan).toBe('enterprise');
    expect(parsedPayload.seats).toBe(50);
  });
});
