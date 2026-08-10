/**
 * Smart EDMS — Prometheus metrics endpoint
 * GET /api/metrics
 *
 * Returns metrics in Prometheus text format for scraping by
 * Prometheus / Grafana / Datadog.
 *
 * Metrics exposed (aggregate only — no tenant_id labels to prevent data leakage):
 *   - smart_edms_documents_total{state}
 *   - smart_edms_users_total{status}
 *   - smart_edms_audit_events_24h{result}
 *   - smart_edms_active_legal_holds
 *   - smart_edms_pending_workflows
 *   - smart_edms_storage_bytes
 *   - smart_edms_uptime_seconds
 *   - smart_edms_process_memory_bytes
 *
 * SECURITY FIX (M-ADM-17): The endpoint now requires a bearer token
 * (METRICS_TOKEN env var) OR a loopback source IP. The previous "no auth,
 * rely on firewall" comment was a soft policy that operators could forget to
 * enforce — and `active_legal_holds` is commercially sensitive (a spike
 * indicates litigation / investigation). The token check is constant-time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timingSafeEqualStr } from '@/lib/auth/crypto';

const startTime = Date.now();

function isLoopback(req: NextRequest): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function isAuthorized(req: NextRequest): boolean {
  // Loopback requests (Prometheus scraper on the same host) are always allowed.
  if (isLoopback(req)) return true;
  // Bearer-token path: requires METRICS_TOKEN env var (≥32 chars).
  const expected = process.env.METRICS_TOKEN;
  if (!expected || expected.length < 32) return false;
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  return timingSafeEqualStr(authHeader.slice(7), expected);
}

export async function GET(req: NextRequest) {
  // SECURITY FIX (M-ADM-17): Require auth on /metrics.
  if (!isAuthorized(req)) {
    return new NextResponse('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }

  const metrics: string[] = [];

  metrics.push('# HELP smart_edms_uptime_seconds Process uptime in seconds');
  metrics.push('# TYPE smart_edms_uptime_seconds counter');
  metrics.push(`smart_edms_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}`);

  metrics.push('# HELP smart_edms_process_memory_bytes Node.js process memory usage (heapUsed)');
  metrics.push('# TYPE smart_edms_process_memory_bytes gauge');
  const mem = process.memoryUsage();
  metrics.push(`smart_edms_process_memory_bytes ${mem.heapUsed}`);
  metrics.push(`smart_edms_process_memory_rss_bytes ${mem.rss}`);

  // Aggregate document counts by state (no tenant_id)
  try {
    const docStats = await db.document.groupBy({
      by: ['state'],
      where: { deletedAt: null },
      _count: true,
    });
    metrics.push('# HELP smart_edms_documents_total Total documents by state');
    metrics.push('# TYPE smart_edms_documents_total gauge');
    for (const s of docStats) {
      metrics.push(`smart_edms_documents_total{state="${s.state}"} ${s._count}`);
    }
  } catch {}

  // Aggregate user counts by status
  try {
    const userStats = await db.user.groupBy({
      by: ['status'],
      _count: true,
    });
    metrics.push('# HELP smart_edms_users_total Total users by status');
    metrics.push('# TYPE smart_edms_users_total gauge');
    for (const s of userStats) {
      metrics.push(`smart_edms_users_total{status="${s.status}"} ${s._count}`);
    }
  } catch {}

  // Audit events by result (last 24h)
  try {
    const auditStats = await db.auditEvent.groupBy({
      by: ['result'],
      where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      _count: true,
    });
    metrics.push('# HELP smart_edms_audit_events_24h Audit events in last 24h by result');
    metrics.push('# TYPE smart_edms_audit_events_24h gauge');
    for (const s of auditStats) {
      metrics.push(`smart_edms_audit_events_24h{result="${s.result}"} ${s._count}`);
    }
  } catch {}

  // Active legal holds (aggregate)
  try {
    const holdCount = await db.legalHold.count({ where: { releasedAt: null } });
    metrics.push('# HELP smart_edms_active_legal_holds Active legal holds (total)');
    metrics.push('# TYPE smart_edms_active_legal_holds gauge');
    metrics.push(`smart_edms_active_legal_holds ${holdCount}`);
  } catch {}

  // Pending workflows (aggregate)
  try {
    const wfCount = await db.workflow.count({ where: { status: 'pending' } });
    metrics.push('# HELP smart_edms_pending_workflows Pending workflows (total)');
    metrics.push('# TYPE smart_edms_pending_workflows gauge');
    metrics.push(`smart_edms_pending_workflows ${wfCount}`);
  } catch {}

  // Storage usage (aggregate)
  try {
    const storageStats = await db.documentVersion.aggregate({
      _sum: { sizeBytes: true },
    });
    metrics.push('# HELP smart_edms_storage_bytes Total storage used (all tenants)');
    metrics.push('# TYPE smart_edms_storage_bytes gauge');
    metrics.push(`smart_edms_storage_bytes ${storageStats._sum.sizeBytes ?? 0}`);
  } catch {}

  return new NextResponse(metrics.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
