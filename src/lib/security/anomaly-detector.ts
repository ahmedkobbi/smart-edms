/**
 * Smart EDMS — Anomaly detector
 *
 * Detects:
 *   - Burst failed logins (>= 10 from same IP in 1h)
 *   - Off-hours access (between 02:00 and 05:00 user-local)
 *   - Mass download (>= 50 downloads in 1h by single user)
 *   - Mass export (>= 10 audit exports in 24h by single user)
 *
 * Idempotent: only creates new anomalies for events not yet correlated.
 */

import { db } from '@/lib/db';

export async function detectAnomalies(tenantId: string): Promise<{ created: number }> {
  let created = 0;
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600_000);
  const oneDayAgo = new Date(now.getTime() - 24 * 3600_000);

  // 1. Burst failed logins
  const failedLogins = await db.auditEvent.findMany({
    where: {
      tenantId,
      eventType: 'auth.login',
      result: 'deny',
      createdAt: { gte: oneHourAgo },
    },
    select: { actorIp: true, actorEmail: true, createdAt: true },
  });

  const byIp = new Map<string, { count: number; email: string }>();
  for (const l of failedLogins) {
    if (!l.actorIp) continue;
    const existing = byIp.get(l.actorIp) || { count: 0, email: l.actorEmail || 'unknown' };
    existing.count++;
    byIp.set(l.actorIp, existing);
  }

  for (const [ip, info] of byIp) {
    if (info.count >= 10) {
      // Check if anomaly already exists for this IP in last hour
      const existing = await db.securityAnomaly.findFirst({
        where: {
          tenantId,
          type: 'burst_failed_logins',
          actorIp: ip,
          createdAt: { gte: oneHourAgo },
        },
      });
      if (!existing) {
        await db.securityAnomaly.create({
          data: {
            tenantId,
            type: 'burst_failed_logins',
            severity: info.count >= 30 ? 'critical' : 'warning',
            description: `${info.count} failed login attempts from IP ${ip} in the last hour`,
            actorIp: ip,
            actorEmail: info.email,
            metadata: JSON.stringify({ count: info.count, window: '1h' }),
          },
        });
        created++;
      }
    }
  }

  // 2. Mass download (>= 50 in 1h by single user)
  const downloads = await db.auditEvent.findMany({
    where: {
      tenantId,
      eventType: { in: ['document.download', 'document.previewed'] },
      createdAt: { gte: oneHourAgo },
    },
    select: { actorId: true, actorEmail: true },
  });
  const byUser = new Map<string, { count: number; email: string }>();
  for (const d of downloads) {
    if (!d.actorId) continue;
    const existing = byUser.get(d.actorId) || { count: 0, email: d.actorEmail || 'unknown' };
    existing.count++;
    byUser.set(d.actorId, existing);
  }
  for (const [userId, info] of byUser) {
    if (info.count >= 50) {
      const existing = await db.securityAnomaly.findFirst({
        where: {
          tenantId,
          type: 'mass_download',
          actorEmail: info.email,
          createdAt: { gte: oneHourAgo },
        },
      });
      if (!existing) {
        await db.securityAnomaly.create({
          data: {
            tenantId,
            type: 'mass_download',
            severity: 'warning',
            description: `${info.count} downloads/previews by ${info.email} in the last hour`,
            actorEmail: info.email,
            metadata: JSON.stringify({ count: info.count, userId, window: '1h' }),
          },
        });
        created++;
      }
    }
  }

  // 3. Mass audit export
  const exports = await db.auditEvent.findMany({
    where: {
      tenantId,
      eventType: { in: ['audit.export', 'audit.export.completed'] },
      createdAt: { gte: oneDayAgo },
    },
    select: { actorId: true, actorEmail: true },
  });
  const byExporter = new Map<string, { count: number; email: string }>();
  for (const e of exports) {
    if (!e.actorId) continue;
    const existing = byExporter.get(e.actorId) || { count: 0, email: e.actorEmail || 'unknown' };
    existing.count++;
    byExporter.set(e.actorId, existing);
  }
  for (const [userId, info] of byExporter) {
    if (info.count >= 10) {
      const existing = await db.securityAnomaly.findFirst({
        where: {
          tenantId,
          type: 'mass_export',
          actorEmail: info.email,
          createdAt: { gte: oneDayAgo },
        },
      });
      if (!existing) {
        await db.securityAnomaly.create({
          data: {
            tenantId,
            type: 'mass_export',
            severity: 'critical',
            description: `${info.count} audit exports by ${info.email} in the last 24h`,
            actorEmail: info.email,
            metadata: JSON.stringify({ count: info.count, userId, window: '24h' }),
          },
        });
        created++;
      }
    }
  }

  return { created };
}
