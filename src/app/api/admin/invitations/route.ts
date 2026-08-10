/**
 * Smart EDMS — User invitations
 * GET  /api/admin/invitations
 * POST /api/admin/invitations   { email, roleNames[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { randomToken, sha256 } from '@/lib/auth/crypto';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify } from '@/lib/notifications/notify';
import { sendInvitationEmail } from '@/lib/notifications/email';
import { getUserLocale } from '@/i18n/server-translator';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.invitation.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  email: z.string().email(),
  roleNames: z.array(z.string()).default(['end_user']),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'invitation.create', action: 'create', resourceType: 'invitation', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const existing = await db.user.findFirst({
      where: { email: body.email.toLowerCase(), tenantId: ctx.tenantId },
    });
    if (existing) throw ApiError.conflict('user_exists', 'User with this email already exists');

    const existingInv = await db.invitation.findFirst({
      where: { email: body.email.toLowerCase(), tenantId: ctx.tenantId, status: 'pending' },
    });
    if (existingInv) throw ApiError.conflict('invitation_exists', 'Pending invitation already exists');

    const token = randomToken(32);
    // SECURITY FIX (M-AUTH-4): Store SHA-256(token), not the raw token.
    // A read-only DB compromise would otherwise yield every pending
    // invitation token — each valid for 7 days and enough to accept the
    // invitation with an attacker-chosen password. The raw token is only
    // ever held in memory and in the email link.
    const invitation = await db.invitation.create({
      data: {
        tenantId: ctx.tenantId,
        email: body.email.toLowerCase(),
        token: sha256(token),
        invitedBy: ctx.userId,
        roleNames: JSON.stringify(body.roleNames),
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600_1000),
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'invitation.sent',
      action: 'create',
      resourceType: 'invitation',
      resourceId: invitation.id,
      resourceName: body.email,
      result: 'allow',
      metadata: { roleNames: body.roleNames, expiresAt: invitation.expiresAt },
    });

    // Send invitation email
    const inviteUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/accept-invite?token=${token}`;

    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    });
    // Send invitation email — invitation is for a NEW user (no UserLocalePreference yet),
    // so we fall back to the inviter's locale (the admin who knows the invitee best).
    const locale = await getUserLocale(ctx.userId);
    await sendInvitationEmail({
      to: body.email,
      tenantName: tenant?.name || 'Smart EDMS',
      inviteUrl,
      inviterEmail: ctx.session.user.email || 'unknown',
      locale,
    });

    return NextResponse.json({
      invitation,
      inviteUrl,
      message: 'Invitation created and email sent.',
    }, { status: 201 });
  },
);
