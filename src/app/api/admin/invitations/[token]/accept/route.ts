/**
 * Smart EDMS — Accept invitation (PUBLIC endpoint)
 * GET  /api/admin/invitations/:token/accept   check invitation validity
 * POST /api/admin/invitations/:token/accept   { name, password }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/crypto';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(200),
  password: z.string().min(12).max(128)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = authRateLimiter.check(`invite:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: { code: 'rate_limited', message: 'Too many attempts' } }, { status: 429 });
  }

  const invitation = await db.invitation.findUnique({ where: { token } });
  if (!invitation) return NextResponse.json({ error: { code: 'not_found', message: 'Invitation not found' } }, { status: 404 });
  if (invitation.status === 'accepted') return NextResponse.json({ error: { code: 'already_accepted', message: 'Invitation already used' } }, { status: 410 });
  if (invitation.expiresAt < new Date()) return NextResponse.json({ error: { code: 'expired', message: 'Invitation expired' } }, { status: 410 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: { code: 'invalid_input', message: err.errors?.[0]?.message || 'Invalid input' } }, { status: 400 });
  }

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
    actorEmail: result.email,
    actorIp: ip,
    actorUserAgent: req.headers.get('user-agent') || 'unknown',
    metadata: { invitationId: invitation.id, roleNames },
  });

  return NextResponse.json({
    ok: true,
    message: 'Account created. You can now sign in.',
    email: result.email,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await db.invitation.findUnique({
    where: { token },
    select: { email: true, status: true, expiresAt: true, tenant: { select: { name: true } } },
  });
  if (!invitation) return NextResponse.json({ error: { code: 'not_found', message: 'Invitation not found' } }, { status: 404 });
  if (invitation.status === 'accepted') return NextResponse.json({ error: { code: 'already_accepted', message: 'Invitation already used' } }, { status: 410 });
  if (invitation.expiresAt < new Date()) return NextResponse.json({ error: { code: 'expired', message: 'Invitation expired' } }, { status: 410 });

  return NextResponse.json({
    email: invitation.email,
    tenantName: invitation.tenant.name,
    expiresAt: invitation.expiresAt,
  });
}
