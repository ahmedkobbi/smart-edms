/**
 * Smart EDMS — Reset password (PUBLIC)
 * POST /api/auth/reset-password
 *
 * Verifies the reset token and updates the password.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, sha256 } from '@/lib/auth/crypto';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';
import { z } from 'zod';

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(12).max(128)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = authRateLimiter.check(`reset-pw:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: { code: 'rate_limited' } }, { status: 429 });
  }

  const body = schema.parse(await req.json().catch(() => ({})));

  // SECURITY FIX (M-AUTH-4): Look up by sha256(token) — the DB never stores
  // the raw token, so a read-only DB leak does not yield live reset tokens.
  const token = await db.verificationToken.findUnique({
    where: { token: sha256(body.token) },
  });

  if (!token || token.expires < new Date()) {
    return NextResponse.json({ error: { code: 'invalid_or_expired', message: 'Token is invalid or expired' } }, { status: 400 });
  }

  const user = await db.user.findFirst({
    where: { id: token.userId ?? undefined, tenantId: token.tenantId },
  });

  if (!user) {
    return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  }

  const passwordHash = await hashPassword(body.password);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });
    await tx.verificationToken.delete({ where: { id: token.id } });
  });

  // SECURITY FIX (H14): Revoke ALL existing sessions for this user so
  // that any attacker who obtained a reset token cannot retain access
  // via previously-issued JWTs after the password is reset.
  const { revokeAllUserSessions } = await import('@/lib/auth/session-revocation');
  await revokeAllUserSessions(user.id, 'password_reset');

  logger.info('auth.password_reset', { userId: user.id, ip });

  await recordAuditEvent({
    tenantId: user.tenantId,
    actorId: user.id,
    actorEmail: user.email,
    actorIp: ip,
    eventType: 'auth.password_reset',
    action: 'update',
    resourceType: 'user',
    resourceId: user.id,
    resourceName: user.email,
    result: 'allow',
    metadata: {},
  });

  return NextResponse.json({ ok: true, message: 'Password updated. You can now sign in.' });
}
