/**
 * Smart EDMS — WebAuthn/Passkey authentication
 *
 * Implements registration and verification of passkeys using
 * @simplewebauthn/server. Passkeys are stored on the User model in
 * the `passkeyCredentials` JSON field.
 *
 * Flow:
 *   1. POST /api/me/passkey/register/init     → generate registration challenge
 *   2. POST /api/me/passkey/register/verify    → verify credential, store
 *   3. POST /api/auth/passkey/login/init       → generate auth challenge (public)
 *   4. POST /api/auth/passkey/login/verify     → verify assertion, sign in
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';

const RP_NAME = 'Smart EDMS';

function getRpId(): string {
  const url = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}

export function generatePasskeyRegistrationOptions(
  userId: string,
  userEmail: string,
  existingCredentials: any[] = [],
) {
  const rpId = getRpId();

  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId,
    userID: userId as any,
    userName: userEmail,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.id,
      type: 'public-key' as const,
      transports: cred.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      // SECURITY FIX (C9): Require user verification (biometric/PIN) for all
      // passkey operations. This ensures the authenticator verified user
      // presence before creating/signing the credential.
      userVerification: 'required',
    },
  });
}

export async function verifyPasskeyRegistration(
  userId: string,
  expectedChallenge: string,
  credential: any,
): Promise<VerifiedRegistrationResponse> {
  const rpId = getRpId();
  const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000';

  return verifyRegistrationResponse({
    response: credential,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
  });
}

export function generatePasskeyAuthOptions(
  existingCredentials: any[] = [],
) {
  const rpId = getRpId();

  return generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials: existingCredentials.map((cred) => ({
      id: cred.id,
      type: 'public-key' as const,
      transports: cred.transports as AuthenticatorTransport[],
    })),
    // SECURITY FIX (C9): Require user verification for authentication too
    userVerification: 'required',
  });
}

export async function verifyPasskeyAuth(
  expectedChallenge: string,
  assertion: any,
  credential: any,
): Promise<VerifiedAuthenticationResponse> {
  const rpId = getRpId();
  const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000';

  return verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    credential,
  });
}

export interface StoredCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  deviceType?: string;
  backedUp?: boolean;
  /** SECURITY FIX (M-AUTH-11): Authenticator Attestation GUID — used by the
   *  register-verify route to enforce a tenant-configured allowlist of
   *  approved hardware authenticators. */
  aaguid?: string;
}
