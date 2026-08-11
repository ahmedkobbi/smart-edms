import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createRecordCategory, DOD_REQUIREMENTS } from '@/lib/records/records-management';
import { db } from '@/lib/db';

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  parentId: z.string().optional(),
  disposition: z.enum(['permanent', 'temporary', 'unscheduled']).default('temporary'),
  retentionActiveYears: z.number().min(0).optional(),
  retentionSemiActiveYears: z.number().min(0).optional(),
  dispositionAction: z.enum(['destroy', 'transfer_to_nara', 'transfer_to_agency']).optional(),
  isVital: z.boolean().default(false),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx) => {
    const categories = await db.recordCategory.findMany({
      where: { tenantId: ctx.targetTenantId },
      include: { folders: { select: { id: true, title: true, status: true } } },
      orderBy: { code: 'asc' },
    });
    return NextResponse.json({ items: categories, total: categories.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE, rateLimit: { max: 20, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = createSchema.parse(await req.json());
    const category = await createRecordCategory({ tenantId: ctx.targetTenantId, ...body, approvedBy: ctx.userId });
    return NextResponse.json({ category }, { status: 201 });
  },
);

export const OPTIONS = async () => {
  return NextResponse.json({ requirements: DOD_REQUIREMENTS });
};
