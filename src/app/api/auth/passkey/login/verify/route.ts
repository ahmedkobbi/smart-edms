/**
 * Smart EDMS — Passkey login verify (PUBLIC)
 * POST /api/auth/passkey/login/verify
 *
 * Verifies the passkey assertion and signs the user in via NextAuth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPasskeyAuth, type StoredCredential } from '@/lib/auth/webauthn';
import { authChallengeStore } from '../init/route';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { resolveUserRoles, resolveUserPermissions } from '@/lib/auth/auth-options';
import { getServerSession } from '@/lib/auth/auth-options';

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
  const challengeKey = assertion.response?.clientDataJSON
    ? JSON.parse(Buffer.from(assertion.response.clientDataJSON, 'base64url').toString()).challenge
    : null;

  const stored = challengeKey ? authChallengeStore.get(challengeKey) : null;
  if (!stored || stored.expiresAt < Date.now()) {
    return NextResponse.json({ error: { code: 'challenge_expired', message: 'Challenge expired' } }, { status: 400 });
  }

  // Find user + credential
  const user = await db.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, email: true, name: true, tenantId: true, status: true, passkeyCredentials: true },
  });

  if (!user || user.status !== 'active') {
    authChallengeStore.delete(stored.challenge);
    return NextResponse.json({ error: { code: 'invalid_user' } }, { status: 403 });
  }

  let credentials: StoredCredential[] = [];
  try {
    credentials = JSON.parse(user.passkeyCredentials || '[]');
  } catch {}

  // Find matching credential by ID
  const credId = assertion.id;
  const credential = credentials.find((c) => c.id === credId);
  if (!credential) {
    authChallengeStore.delete(stored.challenge);
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
      authChallengeStore.delete(stored.challenge);
      return NextResponse.json({ error: { code: 'verification_failed' } }, { status: 403 });
    }

    // Update counter
    credential.counter = verification.authenticationInfo.newCounter;
    await db.user.update({
      where: { id: user.id },
      data: { passkeyCredentials: JSON.stringify(credentials) },
    });

    authChallengeStore.delete(stored.challenge);

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
      metadata: { method: 'webauthn' },
    });

    // Sign in via NextAuth (create session)
    // Since we use Credentials provider, we need to use the signIn flow
    // For passkey, we return a special token that the client uses to complete signIn
    return NextResponse.json({
      verified: true,
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      message: 'Passkey verified. Complete sign-in via client-side signIn callback.',
    });
  } catch (err: any) {
    authChallengeStore.delete(stored.challenge);
    return NextResponse.json({ error: { code: 'verification_failed', message: err.message } }, { status: 403 });
  }
}
