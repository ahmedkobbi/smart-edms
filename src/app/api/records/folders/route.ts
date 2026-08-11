import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createRecordFolder } from '@/lib/records/records-management';
import { db } from '@/lib/db';

const createSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(2),
  description: z.string().optional(),
  fiscalYear: z.string().optional(),
  dateRangeStart: z.string().datetime().optional(),
  dateRangeEnd: z.string().datetime().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE },
  async (req, ctx) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const categoryId = url.searchParams.get('categoryId');

    const where: Record<string, unknown> = { tenantId: ctx.targetTenantId };
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;

    const folders = await db.recordFolder.findMany({
      where,
      include: { category: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ items: folders, total: folders.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE, rateLimit: { max: 20, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = createSchema.parse(await req.json());
    const folder = await createRecordFolder({
      tenantId: ctx.targetTenantId,
      ...body,
      dateRangeStart: body.dateRangeStart ? new Date(body.dateRangeStart) : undefined,
      dateRangeEnd: body.dateRangeEnd ? new Date(body.dateRangeEnd) : undefined,
    });
    return NextResponse.json({ folder }, { status: 201 });
  },
);
