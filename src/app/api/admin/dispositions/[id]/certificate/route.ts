/**
 * Smart EDMS — Certificate of destruction
 * GET /api/admin/dispositions/:id/certificate
 *
 * Returns the certificate (hash + signed payload) for executed dispositions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.AUDIT_READ },
  async (req: NextRequest, ctx, params) => {
    const record = await db.dispositionRecord.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, status: 'executed' },
      include: {
        document: { select: { id: true, title: true, documentType: true, classification: true } },
      },
    });
    if (!record) throw ApiError.notFound('not_found', 'Executed disposition not found');
    if (!record.certificateHash) throw ApiError.badRequest('no_certificate', 'No certificate available');

    return NextResponse.json({
      certificate: {
        hash: record.certificateHash,
        issuedAt: record.executedAt,
        tenantId: ctx.tenantId,
        document: record.document,
        action: record.action,
        reason: record.reason,
        approvedById: record.approvedById,
        scheduleId: record.scheduleId,
        verificationUrl: `/api/admin/dispositions/${record.id}/certificate`,
      },
      note: 'This certificate proves the document was dispositioned in accordance with the recorded policy. ' +
            'The hash attests to the integrity of the certificate payload.',
    });
  },
);
