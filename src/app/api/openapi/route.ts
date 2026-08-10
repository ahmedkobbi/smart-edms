import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const specPath = path.join(process.cwd(), 'docs', 'openapi.json');
    const spec = await fs.readFile(specPath, 'utf-8');
    return NextResponse.json(JSON.parse(spec), {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'spec_not_found', message: 'OpenAPI spec not found' } },
      { status: 404 },
    );
  }
}
