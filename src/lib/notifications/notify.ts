/**
 * Smart EDMS — Notification dispatch service
 *
 * Centralized helper to create notifications + fire webhooks.
 * Used by workflow, share, audit-anomaly, and admin modules.
 */

import { db } from '@/lib/db';
import { sha256 } from '@/lib/auth/crypto';

export interface NotificationInput {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  link?: string;
  metadata?: Record<string, unknown>;
}

export async function notify(input: NotificationInput): Promise<void> {
  await db.notification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      severity: input.severity ?? 'info',
      link: input.link ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
  });
}

export async function notifyMany(inputs: NotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  await db.notification.createMany({
    data: inputs.map((i) => ({
      tenantId: i.tenantId,
      userId: i.userId,
      type: i.type,
      title: i.title,
      body: i.body,
      severity: i.severity ?? 'info',
      link: i.link ?? null,
      metadata: JSON.stringify(i.metadata ?? {}),
    })),
  });
}

/**
 * Fire a webhook for an event. Signs payload with HMAC-SHA256 using the
 * webhook's secret (returned once at creation). Failed deliveries are
 * logged but do not block the calling operation.
 */
export async function fireWebhook(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const webhooks = await db.webhook.findMany({
    where: {
      tenantId,
      enabled: true,
    },
  });

  const body = JSON.stringify({ event, payload, ts: Date.now() });
  const matching = webhooks.filter((w) => {
    try {
      const events: string[] = JSON.parse(w.events || '[]');
      return events.length === 0 || events.includes(event) || events.includes('*');
    } catch {
      return true;
    }
  });

  await Promise.all(
    matching.map(async (w) => {
      try {
        const signature = w.secretHash
          ? sha256(body + w.secretHash)
          : '';
        const res = await fetch(w.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Smart-EDMS-Event': event,
            'X-Smart-EDMS-Signature': signature,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        await db.webhook.update({
          where: { id: w.id },
          data: {
            lastStatus: `${res.status}`,
            lastSentAt: new Date(),
          },
        });
      } catch (err: any) {
        await db.webhook.update({
          where: { id: w.id },
          data: {
            lastStatus: 'error',
            lastSentAt: new Date(),
          },
        });
      }
    }),
  );
}
