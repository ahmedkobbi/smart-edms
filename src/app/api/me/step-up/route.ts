/**
 * Smart EDMS — Step-up authentication
 *
 * POST /api/me/step-up   { challenge: 'totp' | 'password', token?, password? }
 *
 * Verifies a second factor and issues a short-lived step-up token (5 min).
 * The token is returned to the client and must be sent in the
 * X-Step-Up-Token header for privileged operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { verifyPassword, randomToken, sha256 } from '@/lib/auth/crypto';
import { decryptTotpSecret, verifyTotpWithReplay } from '@/lib/auth/totp';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const STEP_UP_TTL_MS = 5 * 60 * 1000;

const schema = z.object({
  challenge: z.enum(['totp', 'password']),
  token: z.string().optional(),
  password: z.string().optional(),
});

export const POST = createApiHandler(
  {
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'auth.stepup', action: 'create', resourceType: 'user', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = schema.parse(await req.json());

    const user = await db.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, email: true, passwordHash: true, mfaEnabled: true, mfaSecretEnc: true, mfaLastTimestep: true },
    });
    if (!user) throw ApiError.notFound('user_not_found', 'User not found');

    if (body.challenge === 'totp') {
      if (!user.mfaEnabled || !user.mfaSecretEnc) {
        throw ApiError.badRequest('mfa_not_enabled', 'MFA is not enabled for this account');
      }
      if (!body.token || !/^\d{6}$/.test(body.token)) {
        throw ApiError.badRequest('invalid_token', 'A 6-digit TOTP code is required');
      }
      const secret = await decryptTotpSecret(user.mfaSecretEnc);
      // SECURITY FIX (M-AUTH-7): Use verifyTotpWithReplay so a phished TOTP
      // code cannot be replayed within the ±30s validity window to mint
      // multiple step-up tokens. Matches the login flow's replay protection.
      const newTimestep = verifyTotpWithReplay(secret, body.token, user.mfaLastTimestep ?? null);
      if (newTimestep === null) {
        throw ApiError.badRequest('invalid_token', 'Invalid TOTP code');
      }
      // Persist the new timestep so the same code cannot be reused
      await db.user.update({ where: { id: user.id }, data: { mfaLastTimestep: newTimestep } });
    } else if (body.challenge === 'password') {
      if (!body.password) throw ApiError.badRequest('missing_password', 'Password is required');
      const ok = await verifyPassword(body.password, user.passwordHash || '');
      if (!ok) throw ApiError.forbidden('invalid_password', 'Current password is incorrect');
    } else {
      throw ApiError.badRequest('invalid_challenge', 'Unknown challenge type');
    }

    const token = randomToken(32);
    const tokenHash = sha256(token); // SECURITY FIX (M-AUTH-5): store hash, not raw token
    const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS);

    await db.stepUpSession.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        token: tokenHash, // store hash — raw token is returned to client only once
        challenge: body.challenge,
        expiresAt,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'auth.stepup.success',
      action: 'create',
      resourceType: 'user',
      resourceId: ctx.userId,
      resourceName: user.email,
      result: 'allow',
      metadata: { challenge: body.challenge, expiresAt: expiresAt.toISOString() },
    });

    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
      expiresInMs: STEP_UP_TTL_MS,
    });
  },
);

// SECURITY FIX (M-AUTH-8): The previously-exported `verifyStepUpToken` helper
// used a non-atomic read-then-update pattern (findFirst → check usedAt → update)
// which reintroduced the C5 TOCTOU race. The handler layer
// (`src/lib/api/handler.ts`) has its own atomic `verifyStepUpToken` that uses
// `updateMany` with a `usedAt: null` precondition — that is the only
// verification path. No code should import a verifier from this file; the
// export has been removed to prevent accidental re-introduction of the race.
