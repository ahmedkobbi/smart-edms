/**
 * Smart EDMS — User locale preferences
 * GET  /api/me/locale    get current preferences
 * PATCH /api/me/locale   update preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { z } from 'zod';

export const GET = createApiHandler(
  {},
  async (req: NextRequest, ctx) => {
    let pref = await db.userLocalePreference.findUnique({
      where: { userId: ctx.userId },
    });

    if (!pref) {
      // Auto-create with defaults
      pref = await db.userLocalePreference.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        },
      });
    }

    return NextResponse.json({ preferences: pref });
  },
);

const patchSchema = z.object({
  locale: z.enum(['en', 'ar', 'fr', 'es', 'de']).optional(),
  timezone: z.string().max(50).optional(),
  direction: z.enum(['ltr', 'rtl']).optional(),
  dateFormat: z.string().max(50).optional(),
  numberFormat: z.string().max(20).optional(),
  calendar: z.enum(['gregory', 'islamic', 'islamic-umalqura']).optional(),
});

export const PATCH = createApiHandler(
  {
    audit: { eventType: 'me.locale.update', action: 'update', resourceType: 'user', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = patchSchema.parse(await req.json());

    // Auto-set direction based on locale
    let direction = body.direction;
    if (body.locale && !direction) {
      direction = body.locale === 'ar' ? 'rtl' : 'ltr';
    }

    const pref = await db.userLocalePreference.upsert({
      where: { userId: ctx.userId },
      update: {
        ...(body.locale ? { locale: body.locale } : {}),
        ...(body.timezone ? { timezone: body.timezone } : {}),
        ...(direction ? { direction } : {}),
        ...(body.dateFormat ? { dateFormat: body.dateFormat } : {}),
        ...(body.numberFormat ? { numberFormat: body.numberFormat } : {}),
        ...(body.calendar ? { calendar: body.calendar } : {}),
      },
      create: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        locale: body.locale || 'en',
        timezone: body.timezone || 'UTC',
        direction: direction || 'ltr',
        dateFormat: body.dateFormat || 'yyyy-MM-dd',
        numberFormat: body.numberFormat || 'en-US',
        calendar: body.calendar || 'gregory',
      },
    });

    return NextResponse.json({ preferences: pref });
  },
);
