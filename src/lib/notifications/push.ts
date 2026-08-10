/**
 * Smart EDMS — Browser push notification service
 *
 * Uses the Web Push API (RFC 8291) via the `web-push` library to send
 * push notifications to subscribed browsers. Supports:
 *   - VAPID key pair generation (one-time setup)
 *   - Subscription management (subscribe/unsubscribe per user per browser)
 *   - Push delivery via the notify() pipeline (alongside in-app + email)
 *   - Automatic cleanup of expired subscriptions (410 Gone responses)
 *
 * VAPID keys are generated on first use if not provided via env vars:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
 *
 * The public key is exposed via GET /api/push/vapid-public-key for the
 * browser's service worker to use during subscription.
 */

import webpush from 'web-push';
import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';

let vapidConfigured = false;

/**
 * Configure web-push with VAPID keys.
 * Generates keys on first use if not provided via env vars.
 */
export function configureVapid(): void {
  if (vapidConfigured) return;

  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;

  // Auto-generate VAPID keys if not set (dev mode)
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    logger.info('push.vapid_keys_generated', {
      note: 'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars for production',
    });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || `mailto:${process.env.SMTP_FROM || 'noreply@smartedms.local'}`,
    publicKey,
    privateKey,
  );

  vapidConfigured = true;
}

/**
 * Get the VAPID public key for the browser client.
 */
export function getVapidPublicKey(): string {
  configureVapid();
  return process.env.VAPID_PUBLIC_KEY || webpush.generateVAPIDKeys().publicKey;
}

/**
 * Subscribe a user's browser to push notifications.
 * Called by the service worker when the user grants notification permission.
 */
export async function subscribePush(opts: {
  tenantId: string;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): Promise<void> {
  await db.pushSubscription.upsert({
    where: { endpoint: opts.endpoint },
    update: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      p256dhKey: opts.keys.p256dh,
      authKey: opts.keys.auth,
      userAgent: opts.userAgent || null,
      updatedAt: new Date(),
    },
    create: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      endpoint: opts.endpoint,
      p256dhKey: opts.keys.p256dh,
      authKey: opts.keys.auth,
      userAgent: opts.userAgent || null,
    },
  });
  logger.info('push.subscribed', { userId: opts.userId, endpoint: opts.endpoint.slice(0, 60) });
}

/**
 * Unsubscribe a user's browser from push notifications.
 */
export async function unsubscribePush(endpoint: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { endpoint } }).catch(() => {});
}

/**
 * Send a push notification to all of a user's subscribed devices.
 * Best-effort — failures are logged and expired subscriptions are cleaned up.
 */
export async function sendPushNotification(opts: {
  userId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  configureVapid();

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: opts.userId },
  });

  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: opts.title,
    body: opts.body,
    url: opts.url || '/notifications',
    tag: opts.tag || 'smart-edms',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
  });

  const expiredEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
          },
          payload,
          { TTL: 86400 }, // 24 hour TTL
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or cancelled — mark for deletion
          expiredEndpoints.push(sub.endpoint);
        } else {
          logger.warn('push.send_failed', {
            userId: opts.userId,
            endpoint: sub.endpoint.slice(0, 60),
            statusCode: err.statusCode,
            error: err.message,
          });
        }
      }
    }),
  );

  // Clean up expired subscriptions
  if (expiredEndpoints.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { endpoint: { in: expiredEndpoints } },
    }).catch(() => {});
    logger.info('push.expired_cleaned', { count: expiredEndpoints.length });
  }
}
