/**
 * Smart EDMS — API 404 catch-all
 *
 * Any /api/* route that doesn't have a specific handler returns a JSON
 * 404 (not the HTML not-found page). This is the standard REST API
 * convention — API clients expect JSON, not HTML.
 *
 * The error envelope matches the standard format used by createApiHandler:
 *   { error: { code, message } }
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: { code: 'not_found', message: 'API endpoint not found' } },
    { status: 404 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: { code: 'not_found', message: 'API endpoint not found' } },
    { status: 404 },
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: { code: 'not_found', message: 'API endpoint not found' } },
    { status: 404 },
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: { code: 'not_found', message: 'API endpoint not found' } },
    { status: 404 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: { code: 'not_found', message: 'API endpoint not found' } },
    { status: 404 },
  );
}
