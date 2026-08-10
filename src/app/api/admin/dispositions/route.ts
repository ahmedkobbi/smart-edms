/**
 * Smart EDMS — Disposition records
 *
 * GET  /api/admin/dispositions            list pending/all dispositions
 * POST /api/admin/dispositions            create disposition request for a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify, notifyMany } from '@/lib/notifications/notify';
import { sendDispositionApprovalEmail } from '@/lib/notifications/email';
import { getUserLocale } from '@/i18n/server-translator';
import { z } from 'zod';
import { logger } from '@/lib/config/logger';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RETENTION_MANAGE },
  async (req: NextRequest, ctx) => {
    const status = req.nextUrl.searchParams.get('status');
    const items = await db.dispositionRecord.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        document: { select: { id: true, title: true, state: true, classification: true } },
      },
      take: 100,
    });
    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  documentId: z.string().min(1),
  scheduleId: z.string().optional(),
  action: z.enum(['delete', 'archive', 'review']),
  reason: z.string().max(500).optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.RETENTION_MANAGE,
    audit: { eventType: 'disposition.create', action: 'create', resourceType: 'disposition', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const doc = await db.document.findFirst({
      where: { id: body.documentId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (doc.legalHold) {
      throw ApiError.forbidden('legal_hold_blocks_disposition', 'Cannot dispose documents under legal hold');
    }

    const existing = await db.dispositionRecord.findFirst({
      where: { documentId: doc.id, tenantId: ctx.tenantId, status: 'pending' },
    });
    if (existing) throw ApiError.conflict('pending_exists', 'A pending disposition already exists for this document');

    const record = await db.dispositionRecord.create({
      data: {
        tenantId: ctx.tenantId,
        documentId: doc.id,
        scheduleId: body.scheduleId ?? null,
        action: body.action,
        requestedById: ctx.userId,
        reason: body.reason,
        status: 'pending',
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'disposition.requested',
      action: 'create',
      resourceType: 'disposition',
      resourceId: record.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: { documentId: doc.id, action: body.action },
    });

    // Notify compliance officers — pass i18n metadata for per-recipient localization
    const complianceOfficers = await db.roleAssignment.findMany({
      where: { tenantId: ctx.tenantId, role: { name: 'compliance_auditor' } },
      select: { userId: true },
    });
    const dispositionUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/admin/dispositions`;
    await notifyMany(
      complianceOfficers.map((c) => ({
        tenantId: ctx.tenantId,
        userId: c.userId,
        type: 'disposition.pending',
        severity: 'warning' as const,
        link: `/admin/dispositions`,
        metadata: {
          dispositionId: record.id,
          documentId: doc.id,
          action: body.action,
          docTitle: doc.title,
        },
      })),
    );

    // Send email to each compliance officer — localized per recipient
    for (const officer of complianceOfficers) {
      const officerUser = await db.user.findUnique({
        where: { id: officer.userId },
        select: { email: true },
      });
      if (officerUser?.email) {
        const officerLocale = await getUserLocale(officer.userId);
        sendDispositionApprovalEmail({
          to: officerUser.email,
          documentTitle: doc.title,
          action: body.action,
          url: dispositionUrl,
          locale: officerLocale,
        }).catch((err) => {
          logger.warn('disposition_failed_to_send_email_to_officer', { message: '[disposition] failed to send email to officer:', error: err });
        });
      }
    }

    return NextResponse.json({ disposition: record }, { status: 201 });
  },
);
