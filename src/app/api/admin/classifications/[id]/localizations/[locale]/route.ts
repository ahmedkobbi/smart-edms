/**
 * Smart EDMS — Classification localization by locale
 *
 * PUT    /api/admin/classifications/:id/localizations/:locale   upsert (create or update)
 * DELETE /api/admin/classifications/:id/localizations/:locale   delete
 *
 * Localizations provide per-locale name + description overrides.
 * The default (English) name/description lives on the Classification
 * model itself; localizations override it for specific locales.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { isValidLocale } from '@/i18n/config';
import { z } from 'zod';

const upsertSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const PUT = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.classification.localization.upsert', action: 'update', resourceType: 'classification', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = upsertSchema.parse(await req.json());
    const locale = params!.locale;

    if (!locale || !isValidLocale(locale)) {
      throw ApiError.badRequest('invalid_locale', `Locale must be one of: en, fr, ar, es, de`);
    }

    const cls = await db.classification.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!cls) throw ApiError.notFound('classification_not_found', 'Classification not found');

    const localization = await db.classificationLocalization.upsert({
      where: {
        classificationId_locale: {
          classificationId: cls.id,
          locale,
        },
      },
      update: {
        name: body.name,
        description: body.description || null,
      },
      create: {
        tenantId: ctx.tenantId,
        classificationId: cls.id,
        locale,
        name: body.name,
        description: body.description || null,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.classification.localization.upsert',
      action: 'update',
      resourceType: 'classification',
      resourceId: cls.id,
      resourceName: cls.name,
      result: 'allow',
      metadata: { locale, name: body.name },
    });

    return NextResponse.json({ localization });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.classification.localization.delete', action: 'delete', resourceType: 'classification', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const locale = params!.locale;

    if (!locale || !isValidLocale(locale)) {
      throw ApiError.badRequest('invalid_locale', `Locale must be one of: en, fr, ar, es, de`);
    }

    const cls = await db.classification.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
    });
    if (!cls) throw ApiError.notFound('classification_not_found', 'Classification not found');

    await db.classificationLocalization.deleteMany({
      where: { classificationId: cls.id, locale },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.classification.localization.delete',
      action: 'delete',
      resourceType: 'classification',
      resourceId: cls.id,
      resourceName: cls.name,
      result: 'allow',
      metadata: { locale },
    });

    return NextResponse.json({ ok: true });
  },
);
