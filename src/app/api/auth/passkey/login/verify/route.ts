/**
 * Smart EDMS — Passkey login verify (PUBLIC)
 * POST /api/auth/passkey/login/verify
 *
 * Verifies the WebAuthn assertion and establishes a NextAuth JWT session
 * by minting the session JWT directly and setting the session cookie.
 *
 * This is a TRUE passwordless login — no fallback to credentials provider,
 * no client-side signIn callback needed. The session cookie is set here
 * and the client redirects to /dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPasskeyAuth, type StoredCredential } from '@/lib/auth/webauthn';
import { authChallengeStore } from '../init/route';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { resolveUserRoles, resolveUserPermissions } from '@/lib/auth/auth-options';
import { encode as encodeJwt } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import { logger } from '@/lib/config/logger';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = authRateLimiter.check(`passkey-verify:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: { code: 'rate_limited' } }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const assertion = body.assertion;
  if (!assertion) {
    return NextResponse.json({ error: { code: 'missing_assertion' } }, { status: 400 });
  }

  // Find the challenge
  let challengeKey: string | null = null;
  try {
    challengeKey = assertion.response?.clientDataJSON
      ? JSON.parse(Buffer.from(assertion.response.clientDataJSON, 'base64url').toString()).challenge
      : null;
  } catch {
    return NextResponse.json({ error: { code: 'invalid_client_data' } }, { status: 400 });
  }

  // SECURITY FIX (M-AUTH-17): authChallengeStore is now async. TTL is
  // managed by the store — an expired entry is simply not returned.
  const stored = challengeKey ? await authChallengeStore.get(challengeKey) : null;
  if (!stored) {
    return NextResponse.json({ error: { code: 'challenge_expired', message: 'Challenge expired' } }, { status: 400 });
  }

  // Find user + credential
  const user = await db.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, email: true, name: true, tenantId: true, status: true, passkeyCredentials: true, mfaEnabled: true, lockedUntil: true },
  });

  if (!user || user.status !== 'active') {
    await authChallengeStore.delete(stored.challenge);
    return NextResponse.json({ error: { code: 'invalid_user' } }, { status: 403 });
  }

  // SECURITY FIX (M-AUTH-3): Honor the per-account lockout for passkey login.
  // The credentials flow already checks `lockedUntil` but passkey login did not —
  // an attacker who locked the password path could still sign in via passkey.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await authChallengeStore.delete(stored.challenge);
    return NextResponse.json({ error: { code: 'account_locked', message: 'Account temporarily locked' } }, { status: 403 });
  }

  let credentials: StoredCredential[] = [];
  try {
    credentials = JSON.parse(user.passkeyCredentials || '[]');
  } catch {}

  // Find matching credential by ID
  const credId = assertion.id;
  const credential = credentials.find((c) => c.id === credId);
  if (!credential) {
    await authChallengeStore.delete(stored.challenge);
    return NextResponse.json({ error: { code: 'credential_not_found' } }, { status: 403 });
  }

  // Verify assertion
  try {
    const verification = await verifyPasskeyAuth(stored.challenge, assertion, {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey, 'base64url'),
      counter: credential.counter,
    });

    if (!verification.verified) {
      await authChallengeStore.delete(stored.challenge);
      return NextResponse.json({ error: { code: 'verification_failed' } }, { status: 403 });
    }

    // Update counter
    credential.counter = verification.authenticationInfo.newCounter;
    await db.user.update({
      where: { id: user.id },
      data: { passkeyCredentials: JSON.stringify(credentials) },
    });

    authChallengeStore.delete(stored.challenge).catch(() => {});

    // Update login info
    await db.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        lastLoginUserAgent: req.headers.get('user-agent') || null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Audit
    await recordAuditEvent({
      tenantId: user.tenantId,
      actorId: user.id,
      actorEmail: user.email,
      actorIp: ip,
      actorUserAgent: req.headers.get('user-agent') || null,
      eventType: 'auth.login',
      action: 'login',
      resourceType: 'user',
      resourceId: user.id,
      resourceName: user.email,
      result: 'allow',
      reason: 'passkey',
      metadata: { method: 'webauthn', credentialId: credential.id.slice(0, 16) },
    });

    // --- Establish NextAuth JWT session ---
    // Mint the session JWT directly and set the cookie, so the user is
    // logged in immediately — no client-side signIn callback needed.
    const roles = await resolveUserRoles(user.id, user.tenantId);
    const permissions = await resolveUserPermissions(user.id, user.tenantId);

    const now = Math.floor(Date.now() / 1000);
    const sessionMaxAge = 8 * 60 * 60; // 8 hours — matches auth-options.ts
    const token = {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      roles,
      permissions,
      // SECURITY FIX (C9): Passkey login did NOT perform TOTP MFA.
      // Set mfaVerified=false — the user must perform step-up auth for
      // MFA-gated operations. WebAuthn user-verification is checked separately
      // (but only counts as MFA if userVerified=true AND the credential is
      // hardware-backed — which we check in hardware-key-enforcement.ts).
      mfaVerified: false,
      refreshAt: Date.now() + 5 * 60 * 1000,
      iat: now,
      exp: now + sessionMaxAge,
      jti: crypto.randomUUID(),
    };

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      logger.error('passkey.no_nextauth_secret', {});
      return NextResponse.json({ error: { code: 'server_error', message: 'Server not configured for sessions' } }, { status: 500 });
    }

    const encoded = await encodeJwt({
      token,
      secret,
      maxAge: sessionMaxAge,
    } as any);

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieName = isProduction
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token';

    const cookieStore = await cookies();
    cookieStore.set(cookieName, encoded, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: sessionMaxAge,
    });

    logger.info('passkey.login_success', { userId: user.id, email: user.email });

    return NextResponse.json({
      verified: true,
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      redirect: '/dashboard',
    });
  } catch (err: any) {
    await authChallengeStore.delete(stored.challenge);
    logger.warn('passkey.verify_failed', { error: err.message });
    return NextResponse.json({ error: { code: 'verification_failed', message: err.message } }, { status: 403 });
  }
}

// crypto.randomUUID fallback for older Node
import { webcrypto } from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto as any;
}
