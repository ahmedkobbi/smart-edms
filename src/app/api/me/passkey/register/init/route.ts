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

const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();

export const POST = createApiHandler(
  {
    // SECURITY FIX (M-AUTH-15): Rate-limit passkey registration init.
    // Without a cap, a hijacked session can spam this endpoint to grow the
    // `challengeStore` Map indefinitely (entries expire after 5 min but the
    // sweep is best-effort) — cheap memory-exhaustion DoS.
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

    // Store challenge for verification (5 min TTL)
    challengeStore.set(user.id, {
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return NextResponse.json(options);
  },
);

export { challengeStore };
