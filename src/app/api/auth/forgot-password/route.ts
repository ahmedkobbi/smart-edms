/**
 * Smart EDMS — Forgot password (PUBLIC)
 * POST /api/auth/forgot-password
 *
 * Generates a password reset token and sends it via email.
 * Does NOT reveal whether the email exists.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { randomToken } from '@/lib/auth/crypto';
import { sendPasswordResetEmail } from '@/lib/notifications/email';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { logger } from '@/lib/config/logger';
import { getUserLocale } from '@/i18n/server-translator';
import { z } from 'zod';

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = authRateLimiter.check(`forgot-pw:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: { code: 'rate_limited', message: 'Too many requests' } }, { status: 429 });
  }

  const body = schema.parse(await req.json().catch(() => ({})));

  const user = await db.user.findFirst({
    where: { email: body.email.toLowerCase(), status: 'active' },
  });

  // Always return success (don't leak whether email exists)
  if (!user) {
    logger.info('auth.forgot_password.unknown_email', { email: body.email, ip });
    return NextResponse.json({ ok: true, message: 'If the email exists, a reset link has been sent.' });
  }

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  await db.verificationToken.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      identifier: user.email,
      token,
      expires: expiresAt,
    },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  // Resolve the user's preferred locale so the reset email arrives in their language.
  // Falls back to 'en' if the user has no preference set.
  const locale = await getUserLocale(user.id);
  await sendPasswordResetEmail({ to: user.email, resetUrl, locale });

  logger.info('auth.forgot_password.sent', { userId: user.id, email: user.email, ip });

  return NextResponse.json({ ok: true, message: 'If the email exists, a reset link has been sent.' });
}
