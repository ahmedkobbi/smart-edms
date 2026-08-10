/**
 * Smart EDMS — MFA setup & verification
 *
 * POST /api/me/mfa/setup           generate secret + QR URI
 * POST /api/me/mfa/enable          { token } verify token, enable MFA
 * POST /api/me/mfa/disable         { token } verify token, disable MFA
 * GET  /api/me/mfa                 current MFA status
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { generateTotpSecret, encryptTotpSecret, decryptTotpSecret, verifyTotp, generateBackupCodes, encryptBackupCodes } from '@/lib/auth/totp';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';
import QRCode from 'qrcode';

export const GET = createApiHandler(
  {},
  async (req: NextRequest, ctx) => {
    const user = await db.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { mfaEnabled: true },
    });
    return NextResponse.json({ mfaEnabled: user?.mfaEnabled ?? false });
  },
);

export const POST = createApiHandler(
  {
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'me.mfa.setup', action: 'update', resourceType: 'user', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const action = req.nextUrl.searchParams.get('action') || 'setup';

    const user = await db.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, email: true, mfaEnabled: true, mfaSecretEnc: true, mfaBackupCodesEnc: true },
    });
    if (!user) throw ApiError.notFound('user_not_found', 'User not found');

    if (action === 'setup') {
      if (user.mfaEnabled) throw ApiError.badRequest('already_enabled', 'MFA is already enabled');
      const { secret, uri } = generateTotpSecret(user.email);
      const enc = await encryptTotpSecret(secret);
      await db.user.update({ where: { id: user.id }, data: { mfaSecretEnc: enc } });
      const qr = await QRCode.toDataURL(uri, { width: 200, margin: 1 });
      return NextResponse.json({ secret, uri, qr });
    }

    if (action === 'enable') {
      const body = await req.json().catch(() => ({}));
      const token = body.token;
      if (!user.mfaSecretEnc) throw ApiError.badRequest('not_setup', 'Run setup first');
      if (!/^\d{6}$/.test(token)) throw ApiError.badRequest('invalid_token', 'Token must be 6 digits');
      const secret = await decryptTotpSecret(user.mfaSecretEnc);
      if (!verifyTotp(secret, token)) throw ApiError.badRequest('invalid_token', 'Invalid TOTP token');

      const codes = generateBackupCodes();
      const encCodes = await encryptBackupCodes(codes);

      await db.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true, mfaBackupCodesEnc: encCodes },
      });

      await recordAuditEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        actorEmail: ctx.session.user.email,
        actorIp: ctx.ip,
        actorUserAgent: ctx.userAgent,
        correlationId: ctx.correlationId,
        eventType: 'me.mfa.enable',
        action: 'update',
        resourceType: 'user',
        resourceId: user.id,
        resourceName: user.email,
        result: 'allow',
        metadata: {},
      });

      return NextResponse.json({ enabled: true, backupCodes: codes });
    }

    if (action === 'disable') {
      const body = await req.json().catch(() => ({}));
      const token = body.token;
      if (!user.mfaEnabled) throw ApiError.badRequest('not_enabled', 'MFA is not enabled');
      if (!user.mfaSecretEnc) throw ApiError.badRequest('not_setup', 'MFA not setup');
      if (!/^\d{6}$/.test(token)) throw ApiError.badRequest('invalid_token', 'Token must be 6 digits');
      const secret = await decryptTotpSecret(user.mfaSecretEnc);
      if (!verifyTotp(secret, token)) throw ApiError.badRequest('invalid_token', 'Invalid TOTP token');

      await db.user.update({
        where: { id: user.id },
        data: { mfaEnabled: false, mfaSecretEnc: null, mfaBackupCodesEnc: null },
      });

      await recordAuditEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        actorEmail: ctx.session.user.email,
        actorIp: ctx.ip,
        actorUserAgent: ctx.userAgent,
        correlationId: ctx.correlationId,
        eventType: 'me.mfa.disable',
        action: 'update',
        resourceType: 'user',
        resourceId: user.id,
        resourceName: user.email,
        result: 'allow',
        metadata: {},
      });

      return NextResponse.json({ enabled: false });
    }

    throw ApiError.badRequest('invalid_action', 'Unknown action');
  },
);
