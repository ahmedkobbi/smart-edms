/**
 * Smart EDMS — Classifications list (read-only, for end users)
 * GET /api/classifications
 *
 * Returns the tenant's classification taxonomy. Names and descriptions
 * are localized per the Accept-Language header (or the user's locale
 * preference) when ClassificationLocalization rows exist for the
 * requested locale. Falls back to the classification's default
 * (English) name/description when no localization is found.
 *
 * Query params:
 *   - locale: explicit locale override (e.g. "ar", "fr")
 *
 * Headers:
 *   - Accept-Language: standard BCP-47 negotiation
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { isValidLocale } from '@/i18n/config';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx) => {
    // Negotiate locale: explicit query param > Accept-Language header > user preference > 'en'
    const explicitLocale = req.nextUrl.searchParams.get('locale');
    const acceptLang = req.headers.get('accept-language');
    let locale = 'en';
    if (explicitLocale && isValidLocale(explicitLocale)) {
      locale = explicitLocale;
    } else if (acceptLang) {
      // Parse Accept-Language: "ar,en;q=0.9,fr;q=0.8" → first preferred
      const first = acceptLang.split(',')[0]?.split(';')[0]?.trim().split('-')[0];
      if (first && isValidLocale(first)) locale = first;
    }

    const items = await db.classification.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { level: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        level: true,
        color: true,
        isSystem: true,
        localizations: {
          where: { locale },
          select: { name: true, description: true },
        },
      },
    });

    // Apply localization: use the localized name/description if available,
    // otherwise fall back to the default (English) values.
    const localized = items.map((c) => {
      const loc = c.localizations[0];
      return {
        id: c.id,
        code: c.code,
        name: loc?.name ?? c.name,
        description: loc?.description ?? c.description,
        level: c.level,
        color: c.color,
        isSystem: c.isSystem,
        localized: !!loc,
        locale,
      };
    });

    return NextResponse.json({ items: localized, locale });
  },
);
