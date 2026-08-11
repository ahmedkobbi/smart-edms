/**
 * Smart EDMS — Admin user management
 * GET   /api/admin/users   list users
 * POST  /api/admin/users   create user (invite)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, SYSTEM_ROLES } from '@/lib/auth/permissions';
import { hashPassword, randomToken } from '@/lib/auth/crypto';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { fireWebhook } from '@/lib/notifications/notify';
import { z } from 'zod';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  status: z.string().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE },
  async (req: NextRequest, ctx) => {
    const q = listQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
    const where = {
      tenantId: ctx.tenantId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { OR: [{ email: { contains: q.search } }, { name: { contains: q.search } }] }
        : {}),
    };
    const [total, items] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, status: true, mfaEnabled: true,
          lastLoginAt: true, lastLoginIp: true, createdAt: true, jobTitle: true, department: true,
          roleAssignments: { include: { role: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return NextResponse.json({ items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.ceil(total / q.pageSize) });
  },
);

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(12).max(128)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character')
    .optional(),
  jobTitle: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  roleNames: z.array(z.string()).default([]),
  sendInvite: z.boolean().default(false),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.user.create', action: 'create', resourceType: 'user', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const existing = await db.user.findFirst({
      where: { email: body.email.toLowerCase(), tenantId: ctx.targetTenantId },
    });
    if (existing) throw ApiError.conflict('user_exists', 'User with this email already exists');

    const password = body.password || generateTempPassword();
    const passwordHash = await hashPassword(password);

    const user = await db.user.create({
      data: {
        tenantId: ctx.tenantId,
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        status: 'active',
        // Force the user to change their password on first login
        // (admin set a temporary password — user must set their own)
        mustChangePassword: !body.password,
        jobTitle: body.jobTitle,
        department: body.department,
        createdBy: ctx.userId,
      },
    });

    // Assign roles
    if (body.roleNames.length > 0) {
      const roles = await db.role.findMany({
        where: { tenantId: ctx.tenantId, name: { in: body.roleNames } },
      });
      for (const role of roles) {
        await db.roleAssignment.create({
          data: {
            tenantId: ctx.tenantId,
            userId: user.id,
            roleId: role.id,
            scope: '',
          },
        });
      }
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.user.create',
      action: 'create',
      resourceType: 'user',
      resourceId: user.id,
      resourceName: user.email,
      result: 'allow',
      metadata: { roleNames: body.roleNames, sendInvite: body.sendInvite },
    });

    await fireWebhook(ctx.tenantId, 'user.created', { userId: user.id, email: user.email, roleNames: body.roleNames });

    return NextResponse.json({
      user: { ...user, passwordHash: undefined },
      temporaryPassword: body.password ? undefined : password,
    }, { status: 201 });
  },
);

import crypto from 'crypto';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(16);
  let pwd = '';
  for (let i = 0; i < 16; i++) pwd += chars[bytes[i] % chars.length];
  if (!/[A-Z]/.test(pwd)) pwd = 'A' + pwd.slice(1);
  if (!/[a-z]/.test(pwd)) pwd = pwd.slice(0, -1) + 'a';
  if (!/[0-9]/.test(pwd)) pwd = pwd.slice(0, -2) + '3' + pwd.slice(-1);
  if (!/[^A-Za-z0-9]/.test(pwd)) pwd = pwd.slice(0, -3) + '!' + pwd.slice(-2);
  return pwd;
}
