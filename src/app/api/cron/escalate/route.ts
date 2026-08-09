/**
 * Smart EDMS — Cron endpoint for workflow escalation
 *
 * GET /api/cron/escalate?key=CRON_SECRET
 *
 * Configure an external scheduler (GitHub Actions / systemd / cloud cron)
 * to hit this endpoint hourly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processOverdueWorkflows } from '@/lib/workflow/escalation';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const expected = process.env.CRON_SECRET;
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await processOverdueWorkflows();
  return NextResponse.json(result);
}
