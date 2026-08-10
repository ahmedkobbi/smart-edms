/**
 * Smart EDMS — Prometheus metrics endpoint
 * GET /api/metrics
 *
 * Returns metrics in Prometheus text format for scraping by
 * Prometheus / Grafana / Datadog.
 *
 * Metrics exposed:
 *   - smart_edms_documents_total{tenant_id, state}
 *   - smart_edms_users_total{tenant_id, status}
 *   - smart_edms_audit_events_total{tenant_id, result}
 *   - smart_edms_active_legal_holds{tenant_id}
 *   - smart_edms_pending_workflows{tenant_id}
 *   - smart_edms_storage_bytes{tenant_id}
 *   - smart_edms_uptime_seconds
 *   - smart_edms_process_memory_bytes
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const startTime = Date.now();

export async function GET() {
  const metrics: string[] = [];

  // Help + type declarations
  metrics.push('# HELP smart_edms_uptime_seconds Process uptime in seconds');
  metrics.push('# TYPE smart_edms_uptime_seconds counter');
  metrics.push(`smart_edms_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}`);

  metrics.push('# HELP smart_edms_process_memory_bytes Node.js process memory usage (heapUsed)');
  metrics.push('# TYPE smart_edms_process_memory_bytes gauge');
  const mem = process.memoryUsage();
  metrics.push(`smart_edms_process_memory_bytes ${mem.heapUsed}`);
  metrics.push(`smart_edms_process_memory_rss_bytes ${mem.rss}`);

  // Aggregate document counts per tenant + state
  try {
    const docStats = await db.document.groupBy({
      by: ['tenantId', 'state'],
      where: { deletedAt: null },
      _count: true,
    });
    metrics.push('# HELP smart_edms_documents_total Total documents by tenant and state');
    metrics.push('# TYPE smart_edms_documents_total gauge');
    for (const s of docStats) {
      metrics.push(`smart_edms_documents_total{tenant_id="${s.tenantId}",state="${s.state}"} ${s._count}`);
    }
  } catch {}

  // User counts
  try {
    const userStats = await db.user.groupBy({
      by: ['tenantId', 'status'],
      _count: true,
    });
    metrics.push('# HELP smart_edms_users_total Total users by tenant and status');
    metrics.push('# TYPE smart_edms_users_total gauge');
    for (const s of userStats) {
      metrics.push(`smart_edms_users_total{tenant_id="${s.tenantId}",status="${s.status}"} ${s._count}`);
    }
  } catch {}

  // Audit events by result (last 24h)
  try {
    const auditStats = await db.auditEvent.groupBy({
      by: ['tenantId', 'result'],
      where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      _count: true,
    });
    metrics.push('# HELP smart_edms_audit_events_24h Audit events in last 24h by tenant and result');
    metrics.push('# TYPE smart_edms_audit_events_24h gauge');
    for (const s of auditStats) {
      metrics.push(`smart_edms_audit_events_24h{tenant_id="${s.tenantId}",result="${s.result}"} ${s._count}`);
    }
  } catch {}

  // Active legal holds
  try {
    const holdCounts = await db.legalHold.groupBy({
      by: ['tenantId'],
      where: { releasedAt: null },
      _count: true,
    });
    metrics.push('# HELP smart_edms_active_legal_holds Active legal holds by tenant');
    metrics.push('# TYPE smart_edms_active_legal_holds gauge');
    for (const s of holdCounts) {
      metrics.push(`smart_edms_active_legal_holds{tenant_id="${s.tenantId}"} ${s._count}`);
    }
  } catch {}

  // Pending workflows
  try {
    const wfCounts = await db.workflow.groupBy({
      by: ['tenantId'],
      where: { status: 'pending' },
      _count: true,
    });
    metrics.push('# HELP smart_edms_pending_workflows Pending workflows by tenant');
    metrics.push('# TYPE smart_edms_pending_workflows gauge');
    for (const s of wfCounts) {
      metrics.push(`smart_edms_pending_workflows{tenant_id="${s.tenantId}"} ${s._count}`);
    }
  } catch {}

  // Storage usage
  try {
    const storageStats = await db.documentVersion.groupBy({
      by: ['tenantId'],
      _sum: { sizeBytes: true },
    });
    metrics.push('# HELP smart_edms_storage_bytes Total storage used by tenant');
    metrics.push('# TYPE smart_edms_storage_bytes gauge');
    for (const s of storageStats) {
      metrics.push(`smart_edms_storage_bytes{tenant_id="${s.tenantId}"} ${s._sum.sizeBytes ?? 0}`);
    }
  } catch {}

  return new NextResponse(metrics.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
