import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createDispositionAuthority } from '@/lib/records/records-management';
import { db } from '@/lib/db';

const schema = z.object({
  authorityType: z.enum(['nara_grs', 'nara_sf', 'agency_specific', 'court_order']).default('agency_specific'),
  authorityNumber: z.string().min(1),
  title: z.string().min(3),
  description: z.string().optional(),
  authorityDocumentUrl: z.string().url().optional(),
  retentionInstructions: z.object({
    active: z.number().min(0).optional(),
    semiActive: z.number().min(0).optional(),
    disposition: z.enum(['destroy', 'transfer_to_nara', 'transfer_to_agency']).optional(),
  }).default({}),
  effectiveDate: z.string().datetime().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE },
  async (req, ctx) => {
    const authorities = await db.dispositionAuthority.findMany({
      where: { tenantId: ctx.targetTenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ items: authorities, total: authorities.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE, rateLimit: { max: 10, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = schema.parse(await req.json());
    const authority = await createDispositionAuthority({
      tenantId: ctx.targetTenantId,
      ...body,
      effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
      approvedBy: ctx.userId,
    });
    return NextResponse.json({ authority }, { status: 201 });
  },
);
