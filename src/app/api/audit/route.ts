/**
 * Smart EDMS — Audit log search
 * GET /api/audit?eventType=&actorId=&resourceType=&resourceId=&from=&to=&page=&pageSize=
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  eventType: z.string().optional(),
  actorId: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  result: z.enum(['allow', 'deny', 'error']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.AUDIT_READ },
  async (req: NextRequest, ctx) => {
    const q = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const where = {
      tenantId: ctx.tenantId,
      ...(q.eventType ? { eventType: q.eventType } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.resourceType ? { resourceType: q.resourceType } : {}),
      ...(q.resourceId ? { resourceId: q.resourceId } : {}),
      ...(q.result ? { result: q.result } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { eventType: { contains: q.search } },
              { actorEmail: { contains: q.search } },
              { resourceName: { contains: q.search } },
              { reason: { contains: q.search } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      db.auditEvent.count({ where }),
      db.auditEvent.findMany({
        where,
        orderBy: { sequenceNum: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    return NextResponse.json({
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.ceil(total / q.pageSize),
    });
  },
);
