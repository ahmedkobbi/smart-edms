/**
 * Smart EDMS — Serve translation files
 * GET /api/translations/:locale
 *
 * Returns the JSON translation file for the requested locale.
 * No auth required — translations are public UI strings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { isValidLocale } from '@/i18n/config';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    return NextResponse.json(
      { error: { code: 'invalid_locale', message: `Unsupported locale: ${locale}` } },
      { status: 400 },
    );
  }

  try {
    const filePath = path.join(process.cwd(), 'messages', `${locale}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'not_found', message: `Translation file not found for: ${locale}` } },
      { status: 404 },
    );
  }
}
