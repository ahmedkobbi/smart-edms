import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { db } from '@/lib/db';
import { DEFAULT_BRANDING, type BrandingConfig } from '@/lib/branding/branding-config';
import { recordAuditEvent } from '@/lib/audit/audit-service';

const brandingSchema = z.object({
  appName: z.string().min(1).max(100).optional(),
  logo: z.string().nullable().optional(),
  primaryColor: z.string().optional(),
  primaryForegroundColor: z.string().optional(),
  accentColor: z.string().optional(),
  accentForegroundColor: z.string().optional(),
  chartColors: z.array(z.string()).length(5).optional(),
  sidebarColor: z.string().optional(),
  sidebarForegroundColor: z.string().optional(),
  loginTitle: z.string().optional(),
  loginSubtitle: z.string().optional(),
  loginBackgroundColor: z.string().optional(),
  emailHeaderColor: z.string().optional(),
  favicon: z.string().nullable().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE },
  async (req, ctx) => {
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { settings: true },
    });
    const settings = JSON.parse(tenant?.settings || '{}');
    const branding = settings.branding || DEFAULT_BRANDING;
    return NextResponse.json({ branding: { ...DEFAULT_BRANDING, ...branding } });
  },
);

export const PUT = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE, requireStepUp: true,
    audit: { eventType: 'admin.branding.updated', action: 'update', resourceType: 'tenant', alwaysAudit: true } },
  async (req, ctx) => {
    const body = brandingSchema.parse(await req.json());
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { settings: true },
    });
    const currentSettings = JSON.parse(tenant?.settings || '{}');
    const currentBranding = currentSettings.branding || DEFAULT_BRANDING;
    const newBranding: BrandingConfig = { ...DEFAULT_BRANDING, ...currentBranding, ...body };
    currentSettings.branding = newBranding;
    await db.tenant.update({
      where: { id: ctx.tenantId },
      data: { settings: JSON.stringify(currentSettings) },
    });
    await recordAuditEvent({
      tenantId: ctx.tenantId,
      eventType: 'admin.branding.updated',
      action: 'update',
      resourceType: 'tenant',
      metadata: { changes: Object.keys(body) },
    });
    return NextResponse.json({ branding: newBranding });
  },
);
