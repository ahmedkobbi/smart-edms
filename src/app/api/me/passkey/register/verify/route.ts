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
    const newCredential: StoredCredential = {
      id: registrationInfo.credentialID,
      publicKey: registrationInfo.credentialPublicKey,
      counter: registrationInfo.counter,
      transports: registrationInfo.credentialDeviceType,
      deviceType: registrationInfo.credentialDeviceType,
      backedUp: registrationInfo.credentialBackedUp,
    };

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
