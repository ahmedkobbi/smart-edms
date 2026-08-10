/**
 * Smart EDMS — Share revoke
 * DELETE /api/documents/:id/share/:sid
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { fireWebhook } from '@/lib/notifications/notify';

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.SHARE_REVOKE,
    audit: { eventType: 'share.revoke', action: 'delete', resourceType: 'share', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const share = await db.share.findFirst({
      where: { id: params!.sid, documentId: params!.id, tenantId: ctx.tenantId },
    });
    if (!share) throw ApiError.notFound('not_found', 'Share not found');
    if (share.revokedAt) throw ApiError.badRequest('already_revoked', 'Share already revoked');

    const reason = req.nextUrl.searchParams.get('reason') || 'Revoked by user';

    await db.share.update({
      where: { id: share.id },
      data: { revokedAt: new Date(), revokeReason: reason },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'share.revoked',
      action: 'delete',
      resourceType: 'share',
      resourceId: share.id,
      resourceName: share.token.slice(0, 16),
      result: 'allow',
      reason,
      metadata: { documentId: share.documentId, recipientEmail: share.recipientEmail },
    });

    await fireWebhook(ctx.tenantId, 'share.revoked', { shareId: share.id, documentId: share.documentId, reason });

    return NextResponse.json({ ok: true });
  },
);
