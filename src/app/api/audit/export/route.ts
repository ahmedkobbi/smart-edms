/**
 * Smart EDMS — Audit CSV export
 * GET /api/audit/export?from=&to=
 *
 * Returns a CSV file with audit events for the requested range.
 * Limited to 10,000 rows per export.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AUDIT_EXPORT,
    rateLimit: { max: 5, windowMs: 60_000 },
    audit: { eventType: 'audit.export', action: 'read', resourceType: 'audit', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');

    const events = await db.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { sequenceNum: 'asc' },
      take: 10_000,
    });

    // Localized headers (accept ?locale= param)
    const locale = req.nextUrl.searchParams.get('locale') || 'en';
    const headers = locale === 'ar' ? [
      'الرقم_التسلسلي', 'التاريخ', 'نوع_الحدث', 'الإجراء', 'النتيجة',
      'المعرف', 'البريد_الإلكتروني', 'عنوان_IP', 'نوع_المورد', 'معرف_المورد',
      'اسم_المورد', 'السبب', 'هاش_الحدث',
    ] : [
      'sequenceNum', 'createdAt', 'eventType', 'action', 'result',
      'actorId', 'actorEmail', 'actorIp', 'resourceType', 'resourceId',
      'resourceName', 'reason', 'eventHash',
    ];
    const rows = events.map((e) =>
      [
        e.sequenceNum,
        e.createdAt.toISOString(),
        e.eventType,
        e.action,
        e.result,
        e.actorId ?? '',
        e.actorEmail ?? '',
        e.actorIp ?? '',
        e.resourceType ?? '',
        e.resourceId ?? '',
        e.resourceName ?? '',
        e.reason ?? '',
        e.eventHash,
      ].map(csvEscape).join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'audit.export.completed',
      action: 'read',
      resourceType: 'audit',
      result: 'allow',
      metadata: { rowCount: events.length, from, to },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-${ctx.tenantId}-${Date.now()}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  },
);
