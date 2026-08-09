/**
 * Smart EDMS — Document audit timeline
 * GET /api/documents/:id/audit
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const events = await db.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { resourceId: doc.id, resourceType: 'document' },
          { AND: [{ resourceType: 'document' }, { resourceName: doc.title }] },
        ],
      },
      orderBy: { sequenceNum: 'desc' },
      take: 200,
    });

    return NextResponse.json({ events });
  },
);
