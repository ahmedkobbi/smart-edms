/**
 * Smart EDMS — Admin user detail
 * GET   /api/admin/users/:id
 * PATCH /api/admin/users/:id   update status, name, role assignments
 * DELETE /api/admin/users/:id  soft-delete (status=suspended)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { fireWebhook } from '@/lib/notifications/notify';
import { revokeAllUserSessions } from '@/lib/auth/session-revocation';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const user = await db.user.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
      select: {
        id: true, email: true, name: true, status: true, mfaEnabled: true,
        lastLoginAt: true, lastLoginIp: true, lastLoginUserAgent: true,
        createdAt: true, updatedAt: true, jobTitle: true, department: true,
        avatarUrl: true, failedLoginAttempts: true, lockedUntil: true,
        roleAssignments: { include: { role: true } },
        groupMemberships: { include: { group: true } },
        _count: { select: { documents: true, auditEvents: true, sessions: true } },
      },
    });
    if (!user) throw ApiError.notFound('user_not_found', 'User not found');
    return NextResponse.json({ user });
  },
);

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'suspended', 'invited', 'locked']).optional(),
  jobTitle: z.string().max(100).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  roleNames: z.array(z.string()).optional(),
  resetMfa: z.boolean().optional(),
  unlockAccount: z.boolean().optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.user.update', action: 'update', resourceType: 'user', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const user = await db.user.findFirst({ where: { id: params!.id, tenantId: ctx.targetTenantId } });
    if (!user) throw ApiError.notFound('user_not_found', 'User not found');

    if (user.id === ctx.userId && body.status === 'suspended') {
      throw ApiError.badRequest('cannot_suspend_self', 'You cannot suspend your own account');
    }

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.status !== undefined) updates.status = body.status;
    if (body.jobTitle !== undefined) updates.jobTitle = body.jobTitle;
    if (body.department !== undefined) updates.department = body.department;
    if (body.unlockAccount) {
      updates.failedLoginAttempts = 0;
      updates.lockedUntil = null;
    }
    if (body.resetMfa) {
      updates.mfaEnabled = false;
      updates.mfaSecretEnc = null;
      updates.mfaBackupCodesEnc = null;
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: updates });

      if (body.roleNames !== undefined) {
        // Replace all role assignments
        await tx.roleAssignment.deleteMany({ where: { userId: user.id, tenantId: ctx.targetTenantId } });
        if (body.roleNames.length > 0) {
          const roles = await tx.role.findMany({
            where: { tenantId: ctx.tenantId, name: { in: body.roleNames } },
          });
          for (const role of roles) {
            await tx.roleAssignment.create({
              data: { tenantId: ctx.tenantId, userId: user.id, roleId: role.id, scope: '' },
            });
          }
        }
      }
    });

    if (body.resetMfa) {
      // SECURITY FIX (M-AUTH-1): Use revokeAllUserSessions — JWT-based sessions
      // are not invalidated by `db.session.deleteMany` (the Session table is unused
      // for active JWTs). revokeAllUserSessions sets `sessionsRevokedAt` (which
      // the API handler checks against the JWT `iat`) and also revokes API keys
      // + active step-up tokens for the user.
      await revokeAllUserSessions(user.id, 'admin_mfa_reset');
    }
    if (body.status === 'suspended') {
      // Same fix for the suspend path inside PATCH (status change).
      await revokeAllUserSessions(user.id, 'admin_suspend');
    }
    if (body.roleNames !== undefined) {
      // SECURITY FIX (L-AUTH-2): Rotate session on role change. The JWT
      // refreshes roles + permissions every 5 min, so without this a
      // demoted admin retains elevated permissions for up to 5 min and a
      // promoted user gains them only after the refresh. Force re-login so
      // the new role set takes effect immediately.
      await revokeAllUserSessions(user.id, 'admin_role_change');
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.user.update',
      action: 'update',
      resourceType: 'user',
      resourceId: user.id,
      resourceName: user.email,
      result: 'allow',
      metadata: {
        changes: Object.keys(body),
        roleNames: body.roleNames,
      },
    });

    return NextResponse.json({ ok: true });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.user.suspend', action: 'delete', resourceType: 'user', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const user = await db.user.findFirst({ where: { id: params!.id, tenantId: ctx.targetTenantId } });
    if (!user) throw ApiError.notFound('user_not_found', 'User not found');
    if (user.id === ctx.userId) throw ApiError.badRequest('cannot_delete_self', 'Cannot delete your own account');

    await db.user.update({ where: { id: user.id }, data: { status: 'suspended' } });
    // SECURITY FIX (M-AUTH-1): revoke JWT sessions + API keys + step-up tokens.
    // The previous `db.session.deleteMany` was a no-op for JWT-based sessions.
    await revokeAllUserSessions(user.id, 'admin_suspend');

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.user.suspend',
      action: 'delete',
      resourceType: 'user',
      resourceId: user.id,
      resourceName: user.email,
      result: 'allow',
      metadata: {},
    });

    await fireWebhook(ctx.tenantId, 'user.suspended', { userId: user.id, email: user.email });

    return NextResponse.json({ ok: true });
  },
);
