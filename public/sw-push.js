/// <reference lib="webworker" />

/**
 * Smart EDMS — Service Worker for push notifications
 *
 * Handles:
 *   - Push event: displays a notification when a push message arrives
 *   - Notification click: opens the notification URL in the app
 *   - Push subscription change: re-subscribes when the browser refreshes keys
 *
 * The service worker is registered from the settings/security page when
 * the user enables push notifications.
 */

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('push', (event: PushEvent) => {
  let data: any;
  try {
    data = event.data?.json();
  } catch {
    data = { title: 'Smart EDMS', body: event.data?.text() || 'New notification' };
  }

  const options: NotificationOptions = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'smart-edms',
    data: { url: data.url || '/notifications' },
    requireInteraction: data.severity === 'critical',
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Smart EDMS', options),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = (event.notification.data as any)?.url || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});

self.addEventListener('pushsubscriptionchange', (event: any) => {
  event.waitUntil(
    (async () => {
      const registration = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: await getVapidKey(),
      });
      // Re-subscribe on the server
      const sub = registration.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: sub.keys,
        }),
      });
    })(),
  );
});

async function getVapidKey(): Promise<string> {
  const resp = await fetch('/api/push/vapid-public-key');
  const data = await resp.json();
  return data.publicKey;
}

export {};
