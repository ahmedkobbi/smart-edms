/**
 * Smart EDMS — Policy violation detector
 *
 * Called when a policy is evaluated and denied. Creates a notification
 * for security officers and logs a security anomaly.
 */

import { db } from '@/lib/db';
import { notify } from '@/lib/notifications/notify';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';

export async function alertPolicyViolation(
  tenantId: string,
  details: {
    policyName?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    resourceName?: string;
    actorId: string;
    actorEmail: string;
    actorIp: string;
    reason: string;
  },
): Promise<void> {
  logger.warn('policy.violation', {
    tenantId,
    policyName: details.policyName,
    action: details.action,
    resourceType: details.resourceType,
    resourceId: details.resourceId,
    actorId: details.actorId,
    reason: details.reason,
  });

  // Create security anomaly record
  await db.securityAnomaly.create({
    data: {
      tenantId,
      type: 'policy_violation',
      severity: 'warning',
      description: `Policy violation: ${details.reason} (action: ${details.action}, resource: ${details.resourceType}:${details.resourceName || details.resourceId})`,
      actorEmail: details.actorEmail,
      actorIp: details.actorIp,
      metadata: JSON.stringify({
        policyName: details.policyName,
        action: details.action,
        resourceType: details.resourceType,
        resourceId: details.resourceId,
        reason: details.reason,
      }),
    },
  }).catch(() => {});

  // Notify all security officers
  const securityOfficers = await db.roleAssignment.findMany({
    where: { tenantId, role: { name: 'security_officer' } },
    select: { userId: true },
  });

  for (const so of securityOfficers) {
    await notify({
      tenantId,
      userId: so.userId,
      type: 'policy.violation',
      title: 'Policy violation detected',
      body: `${details.actorEmail} was denied ${details.action} on ${details.resourceType}:${details.resourceName || details.resourceId}. Reason: ${details.reason}`,
      severity: 'warning',
      link: '/admin/anomalies',
      metadata: {
        policyName: details.policyName,
        action: details.action,
        resourceType: details.resourceType,
        resourceId: details.resourceId,
      },
    });
  }

  await recordAuditEvent({
    tenantId,
    actorId: details.actorId,
    actorEmail: details.actorEmail,
    actorIp: details.actorIp,
    eventType: 'policy.violation',
    action: details.action,
    resourceType: details.resourceType,
    resourceId: details.resourceId,
    resourceName: details.resourceName,
    result: 'deny',
    reason: details.reason,
    metadata: { policyName: details.policyName },
  }).catch(() => {});
}

/**
 * System health check + alert if degraded.
 * Called by the cron endpoint.
 */
export async function checkSystemHealth(tenantId: string): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check database connectivity
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    issues.push('Database unreachable');
  }

  // Check audit chain integrity (last 1000 events)
  try {
    const { verifyAuditChain } = await import('@/lib/audit/audit-service');
    const result = await verifyAuditChain(tenantId, { limit: 1000 });
    if (!result.ok) {
      issues.push(`Audit chain broken at sequence #${result.brokenAt?.sequenceNum}`);
    }
  } catch {
    issues.push('Audit chain verification failed');
  }

  // Check for excessive failed logins (potential attack)
  try {
    const failedLogins = await db.auditEvent.count({
      where: {
        tenantId,
        eventType: 'auth.login',
        result: 'deny',
        createdAt: { gte: new Date(Date.now() - 3600_000) },
      },
    });
    if (failedLogins > 50) {
      issues.push(`${failedLogins} failed logins in the last hour (potential attack)`);
    }
  } catch {}

  const healthy = issues.length === 0;

  if (!healthy) {
    // Notify all tenant admins
    const admins = await db.roleAssignment.findMany({
      where: { tenantId, role: { name: 'tenant_admin' } },
      select: { userId: true },
    });

    for (const a of admins) {
      await notify({
        tenantId,
        userId: a.userId,
        type: 'system.health_degraded',
        title: '⚠️ System health degraded',
        body: `Health check found issues: ${issues.join('; ')}`,
        severity: 'critical',
        link: '/admin/security',
        metadata: { issues },
      });
    }
  }

  return { healthy, issues };
}
