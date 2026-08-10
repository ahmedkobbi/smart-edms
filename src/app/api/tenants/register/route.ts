/**
 * Smart EDMS — Public tenant self-registration
 * POST /api/tenants/register
 *
 * Creates a new tenant + tenant_admin user + trial subscription.
 * This is the PUBLIC signup endpoint — no authentication required.
 *
 * Security:
 *   - Rate limited: 3 signups per IP per hour (prevents abuse)
 *   - Honeypot field: if `company_website` is filled, silently drop (bot trap)
 *   - Password complexity enforced (min 12 chars, upper/lower/digit/special)
 *   - Slug uniqueness checked
 *   - Email uniqueness checked (cross-tenant — one email per tenant)
 *   - All fields validated server-side (zero client trust)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/crypto';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

const signupSchema = z.object({
  tenantName: z.string().min(2).max(200),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only'),
  adminName: z.string().min(1).max(200),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(12).max(128)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  // Honeypot — bots fill this, real users don't see it
  company_website: z.string().max(0).optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // Rate limit: 3 signups per IP per hour
  const rl = await authRateLimiter.check(`signup:${ip}`, 3, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: 'Too many signup attempts. Please try again later.' } },
      { status: 429 },
    );
  }

  let body;
  try {
    body = signupSchema.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: 'invalid_input', message: err.errors?.[0]?.message || 'Invalid input' } },
      { status: 400 },
    );
  }

  // Honeypot check — if filled, silently return success (bot trap)
  if (body.company_website) {
    return NextResponse.json({ ok: true, message: 'Account created.' }, { status: 201 });
  }

  // Check slug uniqueness
  const existingTenant = await db.tenant.findUnique({ where: { slug: body.slug } });
  if (existingTenant) {
    return NextResponse.json(
      { error: { code: 'slug_taken', message: 'This subdomain is already taken. Please choose another.' } },
      { status: 409 },
    );
  }

  // Check email uniqueness (cross-tenant)
  const existingUser = await db.user.findFirst({
    where: { email: body.adminEmail.toLowerCase() },
  });
  if (existingUser) {
    return NextResponse.json(
      { error: { code: 'email_exists', message: 'An account with this email already exists. Please sign in instead.' } },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(body.adminPassword);

  const result = await db.$transaction(async (tx) => {
    // 1. Create tenant
    const tenant = await tx.tenant.create({
      data: {
        name: body.tenantName,
        slug: body.slug,
        status: 'active',
        settings: JSON.stringify({
          branding: { primary: '#0f172a', accent: '#0ea5e9' },
          features: { ai: true, watermark: true, ocr: true },
          residency: 'default',
        }),
      },
    });

    // 2. Create system roles
    const roleIds: Record<string, string> = {};
    for (const [_, roleName] of Object.entries(SYSTEM_ROLES)) {
      const role = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: roleName,
          permissions: JSON.stringify(SYSTEM_ROLE_PERMISSIONS[roleName] ?? []),
          isSystem: true,
          description: `System role: ${roleName}`,
        },
      });
      roleIds[roleName] = role.id;
    }

    // 3. Create default classifications
    const classifications = [
      { code: 'PUBLIC', name: 'Public', level: 0, color: '#16a34a' },
      { code: 'INTERNAL', name: 'Internal', level: 1, color: '#2563eb' },
      { code: 'CONFIDENTIAL', name: 'Confidential', level: 2, color: '#d97706' },
      { code: 'RESTRICTED', name: 'Restricted', level: 3, color: '#dc2626' },
      { code: 'HS', name: 'Highly Sensitive', level: 4, color: '#7c2d12' },
    ];
    for (const c of classifications) {
      await tx.classification.create({
        data: { ...c, tenantId: tenant.id, isSystem: true },
      });
    }

    // 4. Create admin user
    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: body.adminEmail.toLowerCase(),
        name: body.adminName,
        passwordHash,
        status: 'active',
      },
    });

    // 5. Assign tenant_admin role
    await tx.roleAssignment.create({
      data: {
        tenantId: tenant.id,
        userId: admin.id,
        roleId: roleIds[SYSTEM_ROLES.TENANT_ADMIN],
        scope: '',
      },
    });

    // 6. Create trial subscription
    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: 'trial',
        status: 'trialing',
        seats: 5,
        storageBytes: 5 * 1024 * 1024 * 1024,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600_000),
      },
    });

    return { tenant, admin };
  });

  // Audit
  await recordAuditEvent({
    tenantId: result.tenant.id,
    actorId: result.admin.id,
    actorEmail: result.admin.email,
    actorIp: ip,
    eventType: 'tenant.self_registered',
    action: 'create',
    resourceType: 'tenant',
    resourceId: result.tenant.id,
    resourceName: result.tenant.name,
    result: 'allow',
    metadata: {
      tenantSlug: result.tenant.slug,
      adminEmail: result.admin.email,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: 'Account created. You can now sign in.',
    tenantSlug: result.tenant.slug,
    adminEmail: result.admin.email,
  }, { status: 201 });
}
