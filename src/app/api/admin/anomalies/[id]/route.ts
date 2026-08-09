/**
 * Smart EDMS — Anomaly resolve placeholder (use /resolve subroute)
 */

import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ error: { code: 'use_resolve_route' } }, { status: 404 });
}
