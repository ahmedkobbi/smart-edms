/**
 * Smart EDMS — Cron endpoint for all scheduled tasks
 *
 * GET /api/cron/escalate?key=CRON_SECRET
 *
 * Runs ALL scheduled tasks:
 *   1. Workflow escalation (overdue approvals + reminders)
 *   2. Anomaly detection (burst logins, mass downloads, mass exports)
 *   3. System health check (DB + audit chain + failed login rate)
 *   4. Retention disposition processing (auto-create dispositions for due documents)
 *
 * Configure an external scheduler to hit this endpoint hourly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processOverdueWorkflows } from '@/lib/workflow/escalation';
import { detectAnomalies } from '@/lib/security/anomaly-detector';
import { checkSystemHealth } from '@/lib/security/policy-alerts';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';

/**
 * SECURITY FIX (M-ADM-18): Concurrency guard for cron runs.
 * If the external scheduler fires twice (retry, mis-fire) two concurrent
 * cron runs race on retention disposition creation. We use a simple
 * in-process lock (sufficient for single-instance; Redis SETNX is the
 * multi-instance upgrade path documented in H9). The lock auto-expires
 * after 10 minutes to recover from a crashed run.
 */
let cronRunning = false;
let cronStartedAt = 0;
const CRON_LOCK_TTL_MS = 10 * 60 * 1000;

/**
 * SECURITY FIX (M-ADM-18): Accept the secret via X-Cron-Secret header OR
 * `?key=` query param (header preferred — query strings are logged by
 * reverse proxies, browser history, Referer headers).
 */
async function isCronAuthorized(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const { timingSafeEqualStr } = await import('@/lib/auth/crypto');
  // Header path (preferred)
  const headerVal = req.headers.get('x-cron-secret');
  if (headerVal && headerVal.length === expected.length && timingSafeEqualStr(headerVal, expected)) {
    return true;
  }
  // Query-string path (backwards compat)
  const queryVal = req.nextUrl.searchParams.get('key');
  if (queryVal && queryVal.length === expected.length && timingSafeEqualStr(queryVal, expected)) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Concurrency guard
  if (cronRunning && (Date.now() - cronStartedAt) < CRON_LOCK_TTL_MS) {
    logger.warn('cron.skipped_concurrent', { startedAt: cronStartedAt });
    return NextResponse.json({ error: 'cron_already_running', startedAt: cronStartedAt }, { status: 409 });
  }
  cronRunning = true;
  cronStartedAt = Date.now();

  // SECURITY FIX (M-ADM-18): Record an audit event for each cron run so
  // admin-discovered dispositions / escalations can be traced to "system".
  await recordAuditEvent({
    tenantId: 'system',
    actorId: 'system',
    actorEmail: 'system@cron',
    eventType: 'cron.escalate.start',
    action: 'create',
    resourceType: 'system',
    result: 'allow',
    metadata: { triggeredBy: 'cron' },
  }).catch(() => {});

  const results: any = {
    timestamp: new Date().toISOString(),
    tasks: {},
  };

  // Helper to record per-task audit + alert on failure
  const auditTask = async (name: string, ok: boolean, summary: any) => {
    await recordAuditEvent({
      tenantId: 'system',
      actorId: 'system',
      actorEmail: 'system@cron',
      eventType: `cron.${name}.${ok ? 'success' : 'failed'}`,
      action: 'create',
      resourceType: 'system',
      result: ok ? 'allow' : 'error',
      metadata: { task: name, summary },
    }).catch(() => {});
    if (!ok) {
      // Notify security officers on task failure (best-effort)
      const { notify } = await import('@/lib/notifications/notify');
      // Find all tenant admins across all tenants — best-effort
      try {
        const admins = await db.roleAssignment.findMany({
          where: { role: { name: 'tenant_admin' } },
          select: { userId: true, tenantId: true },
          distinct: ['userId', 'tenantId'],
        });
        for (const a of admins.slice(0, 50)) {
          await notify({
            tenantId: a.tenantId,
            userId: a.userId,
            type: 'system.cron_failed',
            severity: 'critical',
            metadata: { task: name, summary: JSON.stringify(summary).slice(0, 500) },
          }).catch(() => {});
        }
      } catch {}
    }
  };

  // 1. Workflow escalation
  try {
    const escalationResult = await processOverdueWorkflows();
    results.tasks.workflowEscalation = escalationResult;
    logger.info('cron.workflow_escalation', escalationResult);
    await auditTask('workflow_escalation', true, escalationResult);
  } catch (err: any) {
    results.tasks.workflowEscalation = { error: err.message };
    logger.error('cron.workflow_escalation_failed', { error: err.message });
    await auditTask('workflow_escalation', false, { error: err.message });
  }

  // 2. Anomaly detection for all tenants
  try {
    const tenants = await db.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    let totalAnomalies = 0;
    for (const t of tenants) {
      const anomalyResult = await detectAnomalies(t.id);
      totalAnomalies += anomalyResult.created;
    }
    results.tasks.anomalyDetection = { anomaliesCreated: totalAnomalies, tenantsChecked: tenants.length };
    logger.info('cron.anomaly_detection', { anomaliesCreated: totalAnomalies });
    await auditTask('anomaly_detection', true, results.tasks.anomalyDetection);
  } catch (err: any) {
    results.tasks.anomalyDetection = { error: err.message };
    logger.error('cron.anomaly_detection_failed', { error: err.message });
    await auditTask('anomaly_detection', false, { error: err.message });
  }

  // 3. System health check for all tenants
  try {
    const tenants = await db.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, name: true },
    });
    const healthResults: any[] = [];
    for (const t of tenants) {
      const health = await checkSystemHealth(t.id);
      healthResults.push({ tenantId: t.id, tenantName: t.name, ...health });
    }
    results.tasks.systemHealth = healthResults;
    logger.info('cron.system_health', { tenantsChecked: tenants.length });
    await auditTask('system_health', true, { tenantsChecked: tenants.length });
  } catch (err: any) {
    results.tasks.systemHealth = { error: err.message };
    logger.error('cron.system_health_failed', { error: err.message });
    await auditTask('system_health', false, { error: err.message });
  }

  // 4. Retention disposition processing
  try {
    const dueDocs = await db.document.findMany({
      where: {
        deletedAt: null,
        legalHold: false,
        isRecord: true,
        retentionDisposeAfter: { lt: new Date() },
      },
      select: {
        id: true, tenantId: true, title: true,
        retentionScheduleId: true, retentionDisposeAfter: true,
      },
      take: 100,
    });

    let dispositionsCreated = 0;
    for (const doc of dueDocs) {
      // Check if disposition already pending
      const existing = await db.dispositionRecord.findFirst({
        where: { documentId: doc.id, status: 'pending' },
      });
      if (existing) continue;

      const schedule = doc.retentionScheduleId
        ? await db.retentionSchedule.findUnique({ where: { id: doc.retentionScheduleId } })
        : null;

      await db.dispositionRecord.create({
        data: {
          tenantId: doc.tenantId,
          documentId: doc.id,
          scheduleId: doc.retentionScheduleId,
          action: schedule?.dispositionAction || 'review',
          requestedById: 'system',
          reason: `Automated: retention period expired (${doc.retentionDisposeAfter?.toISOString()})`,
          status: 'pending',
        },
      });
      dispositionsCreated++;
    }
    results.tasks.retentionProcessing = { dueDocuments: dueDocs.length, dispositionsCreated };
    logger.info('cron.retention_processing', { dueDocuments: dueDocs.length, dispositionsCreated });
    await auditTask('retention_processing', true, results.tasks.retentionProcessing);
  } catch (err: any) {
    results.tasks.retentionProcessing = { error: err.message };
    logger.error('cron.retention_processing_failed', { error: err.message });
    await auditTask('retention_processing', false, { error: err.message });
  }

  // ── Feature maintenance: expire stale signatures, check vital records ──
  try {
    const expiredSignatures = await db.signatureRequest.updateMany({
      where: {
        status: { in: ['sent', 'delivered'] },
        expiresAt: { lt: new Date() },
      },
      data: { status: 'expired' },
    });

    const vitalDue = await db.vitalRecord.count({
      where: { nextReviewAt: { lte: new Date() } },
    });

    const foldersEligible = await db.recordFolder.count({
      where: {
        status: 'cutoff',
        eligibleForDispositionAt: { lte: new Date() },
      },
    });

    results.tasks.featureMaintenance = {
      expiredSignatures: expiredSignatures.count,
      vitalRecordsDueReview: vitalDue,
      foldersEligibleForDisposition: foldersEligible,
    };
    logger.info('cron.feature_maintenance', results.tasks.featureMaintenance);
    await auditTask('feature_maintenance', true, results.tasks.featureMaintenance);
  } catch (err: any) {
    results.tasks.featureMaintenance = { error: err.message };
    logger.error('cron.feature_maintenance_failed', { error: err.message });
    await auditTask('feature_maintenance', false, { error: err.message });
  }

  // Release the lock
  cronRunning = false;

  return NextResponse.json(results);
}
