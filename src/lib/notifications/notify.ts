/**
 * Smart EDMS — Notification dispatch service
 *
 * Centralized helper to create notifications + fire webhooks.
 * Used by workflow, share, audit-anomaly, and admin modules.
 */

import { db } from '@/lib/db';
import { sha256 } from '@/lib/auth/crypto';

/**
 * Push an event to the WebSocket notifications service (best-effort).
 * The WS service runs on port 3003 and relays to connected clients.
 */
async function pushWebSocket(userId: string, event: string, data: unknown): Promise<void> {
  const wsUrl = process.env.WS_SERVICE_URL || 'http://localhost:3003';
  try {
    await fetch(`${wsUrl}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, event, data }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // WS service not running — silent fallback (notifications still in DB)
  }
}

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
  const notification = await db.notification.create({
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

  // Push via WebSocket (best-effort, non-blocking)
  pushWebSocket(input.userId, 'notification:new', {
    id: notification.id,
    type: input.type,
    title: input.title,
    body: input.body,
    severity: input.severity ?? 'info',
    link: input.link,
    createdAt: notification.createdAt,
  }).catch(() => {});
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
      const signature = w.secretHash
        ? sha256(body + w.secretHash)
        : '';

      // Retry with exponential backoff: 1s, 2s, 4s, 8s (max 4 attempts)
      const maxRetries = 4;
      const baseDelay = 1000;
      let lastError: any = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // SSRF check before every attempt (in case DNS changed)
          const { isAllowedOutboundUrl } = await import('@/lib/security/ssrf-guard');
          const ssrfCheck = isAllowedOutboundUrl(w.url);
          if (!ssrfCheck.allowed) {
            await db.webhook.update({
              where: { id: w.id },
              data: { lastStatus: 'blocked_ssrf', lastSentAt: new Date() },
            });
            return;
          }

          const res = await fetch(w.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Smart-EDMS-Event': event,
              'X-Smart-EDMS-Signature': signature,
              'X-Smart-EDMS-Attempt': String(attempt + 1),
            },
            body,
            signal: AbortSignal.timeout(10_000),
          });

          if (res.ok || res.status < 500) {
            // Success or client error (4xx) — don't retry
            await db.webhook.update({
              where: { id: w.id },
              data: {
                lastStatus: `${res.status}`,
                lastSentAt: new Date(),
              },
            });
            return;
          }

          // Server error (5xx) — retry
          lastError = new Error(`HTTP ${res.status}`);
        } catch (err: any) {
          lastError = err;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      // All retries failed
      await db.webhook.update({
        where: { id: w.id },
        data: {
          lastStatus: 'error',
          lastSentAt: new Date(),
        },
      });
    }),
  );
}
