import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { designateVitalRecord } from '@/lib/records/records-management';
import { db } from '@/lib/db';

const schema = z.object({
  documentId: z.string().min(1),
  categoryId: z.string().optional(),
  vitalReason: z.enum(['operational', 'legal', 'financial', 'historical']).default('operational'),
  recordType: z.enum(['essential', 'important', 'useful']).default('important'),
  recoveryPriority: z.number().min(1).max(5).default(3),
  reviewCycleMonths: z.number().min(1).max(36).default(12),
  notes: z.string().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE },
  async (req, ctx) => {
    const records = await db.vitalRecord.findMany({
      where: { tenantId: ctx.targetTenantId },
      include: { document: { select: { id: true, title: true, state: true } } },
      orderBy: { nextReviewAt: 'asc' },
      take: 100,
    });
    return NextResponse.json({ items: records, total: records.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE, rateLimit: { max: 20, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = schema.parse(await req.json());
    const vital = await designateVitalRecord({ tenantId: ctx.targetTenantId, ...body, designatedBy: ctx.userId });
    return NextResponse.json({ vital }, { status: 201 });
  },
);
