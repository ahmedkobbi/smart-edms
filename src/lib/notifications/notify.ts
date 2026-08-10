/**
 * Smart EDMS — Notification dispatch service
 *
 * Centralized helper to create notifications + fire webhooks.
 * Used by workflow, share, audit-anomaly, and admin modules.
 *
 * Production design:
 *   1. Resolves the recipient's locale from UserLocalePreference (DB) using
 *      the cached helper from server-translator.ts. Falls back to 'en'.
 *   2. All notification titles/bodies are localized via the i18n bundle
 *      (notifications.{type}.{title|body}) — supports all 5 locales.
 *   3. The caller-provided title/body are now OPTIONAL and used only as
 *      an emergency fallback if no template exists for the type.
 *   4. Caller-provided metadata values (e.g. { docTitle: "Q4.pdf" }) are
 *      passed to the translator for ICU-style interpolation AND stored
 *      on the Notification row for later audit/replay.
 *   5. Pushes via WebSocket (best-effort) with the localized payload.
 *   6. notifyMany() batches DB writes AND resolves locales per recipient
 *      so a single call to a mixed-locale audience produces correct
 *      translations for each recipient.
 */

import { db } from '@/lib/db';
import { sha256 } from '@/lib/auth/crypto';
import crypto from 'crypto';
import { logger } from '@/lib/config/logger';
import { getTranslator, getUserLocale, type Locale } from '@/i18n/server-translator';

// ---------------------------------------------------------------------------
//  WebSocket relay (best-effort)
// ---------------------------------------------------------------------------

/**
 * Push an event to the WebSocket notifications service (best-effort).
 * The WS service runs on port 3003 and relays to connected clients.
 *
 * SECURITY FIX (M-ADM-21): The internal /notify endpoint must be
 * authenticated so that any process reaching `WS_SERVICE_URL` cannot spoof
 * arbitrary real-time notifications to any user (audit:alert,
 * notification:new, workflow:update) with attacker-controlled titles/bodies.
 * The shared secret is `WS_INTERNAL_SECRET` (also read by the WS service).
 * We also validate that WS_SERVICE_URL is loopback or HTTPS to prevent the
 * secret from leaking over plaintext HTTP to an attacker-controlled host.
 */
async function pushWebSocket(userId: string, event: string, data: unknown): Promise<void> {
  const wsUrl = process.env.WS_SERVICE_URL || 'http://localhost:3003';
  // Refuse to call non-HTTPS / non-loopback URLs in production.
  if (process.env.NODE_ENV === 'production') {
    let url: URL;
    try { url = new URL(wsUrl); } catch { return; }
    const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    if (url.protocol !== 'https:' && !isLoopback) {
      logger.warn('notify.ws_skipped_non_https', { host: url.hostname });
      return;
    }
  }
  const secret = process.env.WS_INTERNAL_SECRET;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret && secret.length >= 32) {
    headers['Authorization'] = `Bearer ${secret}`;
  } else if (process.env.NODE_ENV === 'production') {
    // Refuse to send unauthenticated in production — the WS service should
    // be configured to require the shared secret.
    logger.warn('notify.ws_skipped_no_secret', {});
    return;
  }
  try {
    await fetch(`${wsUrl}/notify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, event, data }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // WS service not running — silent fallback (notifications still in DB)
  }
}

// ---------------------------------------------------------------------------
//  Notification input + dispatch
// ---------------------------------------------------------------------------

export interface NotificationInput {
  tenantId: string;
  userId: string;
  type: string;
  /**
   * Optional — used only if no i18n template exists for `type`.
   * When the template exists, the template's localized title wins.
   */
  title?: string;
  /**
   * Optional — used only if no i18n template exists for `type`.
   * When the template exists, the template's localized body wins.
   */
  body?: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  link?: string;
  /**
   * Interpolation parameters for the i18n template, AND stored on the
   * Notification row for audit/replay.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Resolve the localized title/body for a notification type.
 *
 * Strategy:
 *   1. Try `notifications.{type}.title` and `.body` in the recipient's locale.
 *   2. If missing, fall back to the caller-provided title/body (English).
 *   3. If both are missing, use the type itself as the title and empty body.
 *
 * The translator itself falls back to English when a key is missing from
 * the target locale, so step (1) covers all 5 locales with one lookup.
 */
async function resolveLocalizedContent(
  type: string,
  locale: Locale,
  fallbackTitle: string | undefined,
  fallbackBody: string | undefined,
  params: Record<string, unknown>,
): Promise<{ title: string; body: string }> {
  const t = await getTranslator(locale);

  // The notification type uses dot notation (e.g. "workflow.assigned").
  // In the bundle, this maps to notifications.workflow.assigned.{title,body}.
  const titleKey = `notifications.${type}.title`;
  const bodyKey = `notifications.${type}.body`;

  // Check whether the key exists in the bundle (any locale) — the translator
  // returns the key path itself when missing, so we detect that and fall
  // back to the caller-supplied title/body.
  const translatedTitle = t(titleKey, params);
  const translatedBody = t.raw(bodyKey, params);
  const titleMissing = translatedTitle === titleKey;
  const bodyMissing = translatedBody === bodyKey;

  return {
    title: titleMissing ? (fallbackTitle || type) : translatedTitle,
    body: bodyMissing ? (fallbackBody || '') : translatedBody,
  };
}

export async function notify(input: NotificationInput): Promise<void> {
  // Resolve recipient's locale for localized title/body
  const locale = await getUserLocale(input.userId);

  const metadata = input.metadata ?? {};
  const { title, body } = await resolveLocalizedContent(
    input.type,
    locale,
    input.title,
    input.body,
    metadata,
  );

  const notification = await db.notification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      title,
      body,
      severity: input.severity ?? 'info',
      link: input.link ?? null,
      metadata: JSON.stringify(metadata),
    },
  });

  // Push via WebSocket (best-effort, non-blocking)
  pushWebSocket(input.userId, 'notification:new', {
    id: notification.id,
    type: input.type,
    title,
    body,
    severity: input.severity ?? 'info',
    link: input.link,
    locale,
    createdAt: notification.createdAt,
  }).catch(() => {});

  // Push via browser push notification (best-effort, non-blocking)
  // Only for warning/critical severity (avoid spamming users with info-level pushes)
  const severity = input.severity ?? 'info';
  if (severity === 'warning' || severity === 'critical') {
    try {
      const { sendPushNotification } = await import('@/lib/notifications/push');
      sendPushNotification({
        userId: input.userId,
        title,
        body: body.slice(0, 200),
        url: input.link,
        tag: input.type,
      }).catch(() => {});
    } catch {
      // web-push not configured — silent
    }
  }
}

/**
 * Notify many recipients in a single DB round-trip.
 *
 * Unlike the previous implementation, this resolves each recipient's locale
 * and uses the localized template — so a single bulk call to a mixed-locale
 * audience produces correct translations for every recipient.
 *
 * To stay within Prisma's batch limits, writes are chunked into batches of
 * 100 (configurable via NOTIFY_BATCH_SIZE).
 */
const NOTIFY_BATCH_SIZE = 100;

export async function notifyMany(inputs: NotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;

  // Group by (type, locale) — same template can be reused across recipients
  // with the same locale. We pre-resolve templates per group.
  const byUser = new Map<string, NotificationInput[]>();
  for (const i of inputs) {
    if (!byUser.has(i.userId)) byUser.set(i.userId, []);
    byUser.get(i.userId)!.push(i);
  }

  // Resolve locales for all unique users in parallel
  const userIds = Array.from(byUser.keys());
  const localeMap = new Map<string, Locale>();
  await Promise.all(
    userIds.map(async (uid) => {
      localeMap.set(uid, await getUserLocale(uid));
    }),
  );

  // Resolve localized title/body per (user, input)
  const rows: Array<{
    tenantId: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    severity: string;
    link: string | null;
    metadata: string;
  }> = [];

  for (const input of inputs) {
    const locale = localeMap.get(input.userId) ?? 'en';
    const metadata = input.metadata ?? {};
    const { title, body } = await resolveLocalizedContent(
      input.type,
      locale,
      input.title,
      input.body,
      metadata,
    );
    rows.push({
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      title,
      body,
      severity: input.severity ?? 'info',
      link: input.link ?? null,
      metadata: JSON.stringify(metadata),
    });
  }

  // Chunk + write
  for (let i = 0; i < rows.length; i += NOTIFY_BATCH_SIZE) {
    const batch = rows.slice(i, i + NOTIFY_BATCH_SIZE);
    try {
      await db.notification.createMany({ data: batch });
    } catch (err) {
      logger.error('notify.batch_failed', {
        batchSize: batch.length,
        firstUserId: batch[0]?.userId,
        error: (err as Error).message,
      });
    }
  }

  // Best-effort WS push for each (non-blocking)
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const row = rows[i];
    pushWebSocket(input.userId, 'notification:new', {
      id: `${input.userId}-${i}`, // we don't have the DB id from createMany
      type: input.type,
      title: row.title,
      body: row.body,
      severity: row.severity,
      link: row.link,
      locale: localeMap.get(input.userId),
      createdAt: new Date().toISOString(),
    }).catch(() => {});
  }
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

  // Try to enqueue webhook deliveries as background jobs (production with Redis).
  // Falls back to inline delivery if Redis is unavailable (dev mode).
  try {
    const { enqueueWebhookJob, isRedisAvailable } = await import('@/lib/queue/redis-queue');
    const redisOk = await isRedisAvailable();
    if (redisOk) {
      const matching = webhooks.filter((w) => {
        try {
          const events: string[] = JSON.parse(w.events || '[]');
          return events.length === 0 || events.includes(event) || events.includes('*');
        } catch {
          return true;
        }
      });
      await Promise.all(matching.map((w) =>
        enqueueWebhookJob({
          tenantId,
          webhookId: w.id,
          webhookUrl: w.url,
          webhookSecretHash: w.secretHash || undefined,
          event,
          payload,
        }),
      ));
      return; // All enqueued — don't do inline delivery
    }
  } catch {
    // Redis not available — fall through to inline delivery
  }

  // --- Inline delivery (dev mode without Redis) ---

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
      // SECURITY FIX (M-ADM-3): Use HMAC-SHA256 instead of SHA256(body+secret).
      // Plain SHA-256 concatenation is vulnerable to length-extension attacks:
      // an attacker who captures a valid (body, signature) pair can compute a
      // valid signature for `body || padding || extension` without knowing the
      // secret. HMAC's two-pass construction defeats this.
      const signature = w.secretHash
        ? crypto.createHmac('sha256', w.secretHash).update(body).digest('hex')
        : '';

      // Retry with exponential backoff: 1s, 2s, 4s, 8s (max 4 attempts)
      const maxRetries = 4;
      const baseDelay = 1000;
      let lastError: any = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // SECURITY FIX (M-ADM-5 + M-ADM-6): Enforce HTTPS in production and
          // use the async SSRF guard (with DNS resolution) to defeat DNS
          // rebinding. The previous `isAllowedOutboundUrl()` only inspected
          // the hostname string — an attacker could register a domain that
          // resolved to a public IP (passing the check) then re-bind it to
          // 127.0.0.1 before the fetch ran. The async `isSafeOutboundUrl()`
          // resolves DNS and the dispatcher pinning below keeps the fetch on
          // the resolved IP.
          if (process.env.NODE_ENV === 'production' && !w.url.startsWith('https://')) {
            await db.webhook.update({
              where: { id: w.id },
              data: { lastStatus: 'blocked_http', lastSentAt: new Date() },
            });
            return;
          }
          const { isSafeOutboundUrl } = await import('@/lib/security/ssrf-guard');
          const ssrfCheck = await isSafeOutboundUrl(w.url);
          if (!ssrfCheck.allowed) {
            await db.webhook.update({
              where: { id: w.id },
              data: { lastStatus: 'blocked_ssrf', lastSentAt: new Date() },
            });
            return;
          }

          // SECURITY FIX (L-INFRA-7): Use ssrfSafeFetch which DNS-pins
          // the connection to the verified IP — defeats DNS rebinding
          // TOCTOU between the isSafeOutboundUrl check and the actual
          // fetch. The previous bare fetch() used the original hostname,
          // allowing an attacker to re-bind DNS to 127.0.0.1 after the
          // check passed.
          const { ssrfSafeFetch, SsrfError } = await import('@/lib/security/ssrf-safe-fetch');
          let res: any;
          try {
            res = await ssrfSafeFetch(w.url, {
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
          } catch (err: any) {
            if (err instanceof SsrfError) {
              await db.webhook.update({
                where: { id: w.id },
                data: { lastStatus: 'blocked_ssrf', lastSentAt: new Date() },
              });
              return;
            }
            throw err;
          }

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
