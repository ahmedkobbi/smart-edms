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
import { logger } from '@/lib/config/logger';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const expected = process.env.CRON_SECRET;
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    tasks: {},
  };

  // 1. Workflow escalation
  try {
    const escalationResult = await processOverdueWorkflows();
    results.tasks.workflowEscalation = escalationResult;
    logger.info('cron.workflow_escalation', escalationResult);
  } catch (err: any) {
    results.tasks.workflowEscalation = { error: err.message };
    logger.error('cron.workflow_escalation_failed', { error: err.message });
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
  } catch (err: any) {
    results.tasks.anomalyDetection = { error: err.message };
    logger.error('cron.anomaly_detection_failed', { error: err.message });
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
  } catch (err: any) {
    results.tasks.systemHealth = { error: err.message };
    logger.error('cron.system_health_failed', { error: err.message });
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
  } catch (err: any) {
    results.tasks.retentionProcessing = { error: err.message };
    logger.error('cron.retention_processing_failed', { error: err.message });
  }

  return NextResponse.json(results);
}
