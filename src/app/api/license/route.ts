import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { installLicense, checkLicenseAccess, getDeploymentMode } from '@/lib/billing/access-gate';
import { db } from '@/lib/db';

const installSchema = z.object({
  licenseKey: z.string().min(50, 'License key is too short'),
});

// GET — returns the current license status
export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE },
  async (req, ctx) => {
    if (getDeploymentMode() !== 'onprem') {
      return NextResponse.json({ error: { code: 'not_onprem', message: 'License management is only available in on-premise mode' } }, { status: 400 });
    }

    const license = await db.license.findUnique({
      where: { tenantId: ctx.targetTenantId },
    });

    if (!license) {
      return NextResponse.json({ license: null, status: 'no_license' });
    }

    return NextResponse.json({
      license: {
        id: license.id,
        licenseeName: license.licenseeName,
        plan: license.plan,
        seats: license.seats,
        storageBytes: license.storageBytes.toString(),
        features: JSON.parse(license.features),
        issuedAt: license.issuedAt,
        expiresAt: license.expiresAt,
        status: license.status,
        gracePeriodDays: license.gracePeriodDays,
        gracePeriodEndsAt: license.gracePeriodEndsAt,
        lockedAt: license.lockedAt,
        issuedBy: license.issuedBy,
      },
    });
  },
);

// POST — install/replace a license
export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE, rateLimit: { max: 5, windowMs: 60_000 },
    audit: { eventType: 'license.installed', action: 'create', resourceType: 'license', alwaysAudit: true } },
  async (req, ctx) => {
    if (getDeploymentMode() !== 'onprem') {
      return NextResponse.json({ error: { code: 'not_onprem', message: 'License management is only available in on-premise mode' } }, { status: 400 });
    }

    const body = installSchema.parse(await req.json());

    try {
      await installLicense(body.licenseKey, ctx.targetTenantId);
      const access = await checkLicenseAccess(ctx.targetTenantId);
      return NextResponse.json({ installed: true, status: access.status, message: 'License installed successfully' });
    } catch (err: any) {
      throw ApiError.badRequest('license_invalid', err.message);
    }
  },
);
