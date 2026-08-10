/**
 * Smart EDMS — Passkey registration init
 * POST /api/me/passkey/register/init
 *
 * Returns WebAuthn registration options (challenge).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { generatePasskeyRegistrationOptions } from '@/lib/auth/webauthn';
import { createChallengeStore } from '@/lib/auth/challenge-store';

/**
 * SECURITY FIX (M-AUTH-17 / L-AUTH-4): Replace the in-memory `Map` with a
 * Redis-backed challenge store (with in-memory fallback for dev). Passkey
 * registration now works in multi-instance deploys.
 */
const challengeStore = createChallengeStore<{ challenge: string }>('passkey-register');
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const POST = createApiHandler(
  {
    // SECURITY FIX (M-AUTH-15): Rate-limit passkey registration init.
    rateLimit: { max: 5, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx) => {
    const user = await db.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, email: true, passkeyCredentials: true },
    });
    if (!user) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });

    let existingCreds: any[] = [];
    try {
      existingCreds = JSON.parse(user.passkeyCredentials || '[]');
    } catch {}

    const options = await generatePasskeyRegistrationOptions(user.id, user.email, existingCreds);

    // Store challenge (TTL managed by the store)
    await challengeStore.set(user.id, { challenge: options.challenge }, CHALLENGE_TTL_MS);

    return NextResponse.json(options);
  },
);

export { challengeStore };
