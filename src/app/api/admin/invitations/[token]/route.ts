/**
 * Smart EDMS — Accept invitation
 * POST /api/admin/invitations/:token   { name, password }
 *
 * Creates the user account, assigns roles, marks invitation accepted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { hashPassword } from '@/lib/auth/crypto';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(200),
  password: z.string().min(12).max(128)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
});

export const POST = createApiHandler(
  {
    rateLimit: { max: 10, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx, params) => {
    // Note: this endpoint is public (no session required).
    // createApiHandler requires a session, so we bypass it.
    return handleAccept(req, params!.token);
  },
);

async function handleAccept(req: NextRequest, token: string): Promise<NextResponse> {
  const invitation = await db.invitation.findUnique({ where: { token } });
  if (!invitation) return NextResponse.json({ error: { code: 'not_found', message: 'Invitation not found' } }, { status: 404 });
  if (invitation.status === 'accepted') return NextResponse.json({ error: { code: 'already_accepted', message: 'Invitation already used' } }, { status: 410 });
  if (invitation.expiresAt < new Date()) return NextResponse.json({ error: { code: 'expired', message: 'Invitation expired' } }, { status: 410 });

  const body = schema.parse(await req.json());

  const passwordHash = await hashPassword(body.password);
  const roleNames: string[] = JSON.parse(invitation.roleNames || '[]');

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: invitation.tenantId,
        email: invitation.email,
        name: body.name,
        passwordHash,
        status: 'active',
      },
    });

    if (roleNames.length > 0) {
      const roles = await tx.role.findMany({
        where: { tenantId: invitation.tenantId, name: { in: roleNames } },
      });
      for (const role of roles) {
        await tx.roleAssignment.create({
          data: { tenantId: invitation.tenantId, userId: user.id, roleId: role.id, scope: '' },
        });
      }
    }

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted', acceptedAt: new Date(), acceptedById: user.id },
    });

    return user;
  });

  await recordAuditEvent({
    tenantId: invitation.tenantId,
    eventType: 'invitation.accepted',
    action: 'create',
    resourceType: 'user',
    resourceId: result.id,
    resourceName: result.email,
    result: 'allow',
    metadata: { invitationId: invitation.id, roleNames },
  });

  return NextResponse.json({
    ok: true,
    message: 'Account created. You can now sign in.',
    email: result.email,
  });
}
