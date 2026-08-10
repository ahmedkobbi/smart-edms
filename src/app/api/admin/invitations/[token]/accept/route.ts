/**
 * Smart EDMS — Accept invitation (PUBLIC endpoint)
 * GET  /api/admin/invitations/:token/accept   check invitation validity
 * POST /api/admin/invitations/:token/accept   { name, password }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, sha256 } from '@/lib/auth/crypto';
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

  // SECURITY FIX (M-AUTH-4): The DB stores sha256(token); hash before lookup.
  const tokenHash = sha256(token);
  const invitation = await db.invitation.findUnique({ where: { token: tokenHash } });
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

  // SECURITY FIX (M-AUTH-16): Atomic invitation claim to prevent TOCTOU race
  // where two concurrent POSTs both pass the `status === 'accepted'` check
  // (both see 'pending'), both create distinct User rows with the same email,
  // and both mark the invitation accepted. The fix uses updateMany with a
  // conditional WHERE clause so only ONE concurrent request can win the claim.
  // The user-create + role-assignment + claim happen inside the same tx.
  const result = await db.$transaction(async (tx) => {
    // Atomically claim the invitation: only succeeds if status is still 'pending'
    // and the invitation has not expired. count=0 → another request won the race.
    const claim = await tx.invitation.updateMany({
      where: {
        id: invitation.id,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      data: { status: 'accepted', acceptedAt: new Date() },
    });
    if (claim.count !== 1) {
      throw new Error('already_accepted');
    }

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

    // Record the accepting user's ID on the invitation now that we have it
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedById: user.id },
    });

    return user;
  }).catch((err) => {
    if (err instanceof Error && err.message === 'already_accepted') {
      return null;
    }
    throw err;
  });

  if (!result) {
    return NextResponse.json({ error: { code: 'already_accepted', message: 'Invitation already used' } }, { status: 410 });
  }

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
  // SECURITY FIX (M-AUTH-4): Hash the token before lookup.
  const invitation = await db.invitation.findUnique({
    where: { token: sha256(token) },
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
