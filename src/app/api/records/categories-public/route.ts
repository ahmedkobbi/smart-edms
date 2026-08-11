import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

// Returns record categories for the document → record category assignment dropdown.
// Uses DOCUMENT_READ permission (not RECORD_CATEGORY_MANAGE) because any user
// who can view a document should be able to see available categories to assign.
export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ, rateLimit: { max: 30, windowMs: 60_000 } },
  async (req, ctx) => {
    const categories = await db.recordCategory.findMany({
      where: { tenantId: ctx.targetTenantId, status: 'active' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        disposition: true,
        isVital: true,
        parentId: true,
      },
      orderBy: { code: 'asc' },
    });

    return NextResponse.json({ items: categories, total: categories.length });
  },
);
