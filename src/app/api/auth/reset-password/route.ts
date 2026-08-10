/**
 * Smart EDMS — Reset password (PUBLIC)
 * POST /api/auth/reset-password
 *
 * Verifies the reset token and updates the password.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/crypto';
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

  const token = await db.verificationToken.findUnique({
    where: { token: body.token },
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
