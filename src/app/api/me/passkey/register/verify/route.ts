/**
 * Smart EDMS — Passkey registration verify
 * POST /api/me/passkey/register/verify
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { verifyPasskeyRegistration, type StoredCredential } from '@/lib/auth/webauthn';
import { challengeStore } from '../init/route';

export const POST = createApiHandler(
  {
    // SECURITY FIX (M-AUTH-15): Rate-limit passkey registration verify — each
    // call performs CPU-intensive WebAuthn signature verification and writes
    // to the user record. Without a cap, a hijacked session can spam the
    // endpoint to exhaust CPU or fill the user's credential list.
    rateLimit: { max: 5, windowMs: 60_000 },
    audit: { eventType: 'passkey.register', action: 'create', resourceType: 'user', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const credential = body.credential;
    if (!credential) throw ApiError.badRequest('missing_credential', 'Credential is required');

    const stored = challengeStore.get(ctx.userId);
    if (!stored || stored.expiresAt < Date.now()) {
      throw ApiError.badRequest('challenge_expired', 'Challenge expired. Try again.');
    }

    const verification = await verifyPasskeyRegistration(
      ctx.userId,
      stored.challenge,
      credential,
    );

    if (!verification.verified || !verification.registrationInfo) {
      throw ApiError.badRequest('verification_failed', 'Passkey verification failed');
    }

    const { registrationInfo } = verification;
    const cred = (registrationInfo as any)?.credential || registrationInfo;
    const newCredential: StoredCredential = {
      id: cred.id || (registrationInfo as any)?.credentialID,
      publicKey: Buffer.from(cred.publicKey || (registrationInfo as any)?.credentialPublicKey || new Uint8Array()).toString('base64url'),
      counter: cred.counter || (registrationInfo as any)?.counter || 0,
      transports: (registrationInfo as any)?.credentialDeviceType,
      deviceType: (registrationInfo as any)?.credentialDeviceType,
      backedUp: (registrationInfo as any)?.credentialBackedUp,
      aaguid: (registrationInfo as any)?.aaguid || (registrationInfo as any)?.authenticatorAAGUID || (cred as any)?.aaguid,
    };

    // SECURITY FIX (M-AUTH-11): AAGUID allowlist for passkey registration.
    // Without this, a user with a hijacked session can enroll a software
    // authenticator that reports `backedUp: false` (device-bound soft token)
    // which then passes the "require true hardware key" check (which only
    // inspects `backedUp`). When the tenant configures
    // `settings.security.allowedAaguids`, only authenticators whose AAGUID
    // is on the list may be registered. An empty/missing allowlist means
    // "no restriction" (preserves backwards compatibility).
    const aaguid: string | undefined = newCredential.aaguid;
    if (aaguid) {
      const tenant = await db.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { settings: true },
      });
      try {
        const settings = JSON.parse(tenant?.settings || '{}');
        const allowedAaguids: string[] = settings?.security?.allowedAaguids ?? [];
        if (allowedAaguids.length > 0 && !allowedAaguids.includes(aaguid)) {
          throw ApiError.badRequest(
            'authenticator_not_allowed',
            'This authenticator is not on the tenant allowlist. Contact your administrator.',
          );
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
        // Settings parse failure — fail open for functionality (do not block registration)
      }
    }

    // Append to user's credentials
    const user = await db.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { passkeyCredentials: true },
    });
    let existing: StoredCredential[] = [];
    try {
      existing = JSON.parse(user?.passkeyCredentials || '[]');
    } catch {}

    existing.push(newCredential);
    await db.user.update({
      where: { id: ctx.userId },
      data: { passkeyCredentials: JSON.stringify(existing) },
    });

    challengeStore.delete(ctx.userId);

    return NextResponse.json({ verified: true, credentialId: newCredential.id });
  },
);
