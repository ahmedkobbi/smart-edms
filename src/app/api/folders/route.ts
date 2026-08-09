/**
 * Smart EDMS — Folders API
 * GET   /api/folders?parentId=   list folders (root if no parentId)
 * POST  /api/folders             create folder
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx) => {
    const parentId = req.nextUrl.searchParams.get('parentId') || null;
    const items = await db.folder.findMany({
      where: { tenantId: ctx.tenantId, parentId: parentId ?? null },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { documents: true, children: true } },
      },
    });
    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  parentId: z.string().optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_CREATE,
    audit: { eventType: 'folder.create', action: 'create', resourceType: 'folder', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    if (body.parentId) {
      const parent = await db.folder.findFirst({
        where: { id: body.parentId, tenantId: ctx.tenantId },
      });
      if (!parent) throw ApiError.badRequest('invalid_parent', 'Parent folder not found');
    }

    const folder = await db.folder.create({
      data: {
        tenantId: ctx.tenantId,
        parentId: body.parentId ?? null,
        name: body.name,
        description: body.description,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ folder }, { status: 201 });
  },
);
