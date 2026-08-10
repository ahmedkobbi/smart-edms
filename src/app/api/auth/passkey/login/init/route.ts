/**
 * Smart EDMS — Passkey login init (PUBLIC)
 * POST /api/auth/passkey/login/init
 *
 * Returns authentication options for passkey login.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generatePasskeyAuthOptions } from '@/lib/auth/webauthn';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { createChallengeStore } from '@/lib/auth/challenge-store';

/**
 * SECURITY FIX (M-AUTH-17 / L-AUTH-4): Replace the in-memory `Map` with a
 * Redis-backed challenge store (with in-memory fallback for dev). Passkey
 * login now works in multi-instance deploys.
 */
const authChallengeStore = createChallengeStore<{ challenge: string; userId: string }>('passkey-login');
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = authRateLimiter.check(`passkey-init:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: { code: 'rate_limited' } }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = body.email?.toLowerCase();

  if (!email) {
    // If no email, generate options that allow any credential
    const options = await generatePasskeyAuthOptions([]);
    return NextResponse.json(options);
  }

  // Find user by email
  const user = await db.user.findFirst({
    where: { email, tenant: { status: 'active' } },
    select: { id: true, tenantId: true, passkeyCredentials: true, status: true },
  });

  if (!user || user.status !== 'active') {
    // Don't leak whether email exists — return generic options
    const options = await generatePasskeyAuthOptions([]);
    return NextResponse.json(options);
  }

  let credentials: any[] = [];
  try {
    credentials = JSON.parse(user.passkeyCredentials || '[]');
  } catch {}

  if (credentials.length === 0) {
    const options = await generatePasskeyAuthOptions([]);
    return NextResponse.json(options);
  }

  const options = await generatePasskeyAuthOptions(credentials);

  // Store challenge with user mapping (TTL managed by the store)
  await authChallengeStore.set(options.challenge, {
    challenge: options.challenge,
    userId: user.id,
  }, CHALLENGE_TTL_MS);

  return NextResponse.json(options);
}

export { authChallengeStore };
