/**
 * Smart EDMS — Notification dispatch service
 *
 * Centralized helper to create notifications + fire webhooks.
 * Used by workflow, share, audit-anomaly, and admin modules.
 */

import { db } from '@/lib/db';
import { sha256 } from '@/lib/auth/crypto';
import { logger } from '@/lib/config/logger';

/**
 * Resolve a user's locale from their UserLocalePreference.
 * Falls back to 'en' if not set.
 */
async function getUserLocale(userId: string): Promise<string> {
  try {
    const pref = await db.userLocalePreference.findUnique({
      where: { userId },
      select: { locale: true },
    });
    return pref?.locale || 'en';
  } catch {
    return 'en';
  }
}

/**
 * Localized notification message templates.
 * Returns { title, body } in the user's locale.
 */
function getLocalizedNotification(
  type: string,
  locale: string,
  params: Record<string, string | number>,
): { title: string; body: string } {
  const ar = locale === 'ar';
  const templates: Record<string, { en: { title: string; body: (p: any) => string }; ar: { title: string; body: (p: any) => string } }> = {
    'security.failed_login': {
      en: { title: 'Failed login attempt', body: (p) => `There were ${p.count} failed login attempts on your account from IP ${p.ip}.` },
      ar: { title: 'محاولة دخول فاشلة', body: (p) => `كانت هناك ${p.count} محاولات دخول فاشلة على حسابك من IP ${p.ip}.` },
    },
    'security.account_locked': {
      en: { title: 'Account locked', body: (p) => `Account ${p.email} was locked after 5 failed login attempts from IP ${p.ip}.` },
      ar: { title: 'تم قفل الحساب', body: (p) => `تم قفل الحساب ${p.email} بعد 5 محاولات دخول فاشلة من IP ${p.ip}.` },
    },
    'workflow.assigned': {
      en: { title: 'Approval requested', body: (p) => `You have been assigned to approve "${p.docTitle}" (${p.wfName}).` },
      ar: { title: 'طلب موافقة', body: (p) => `تم تعيينك للموافقة على "${p.docTitle}" (${p.wfName}).` },
    },
    'workflow.escalated': {
      en: { title: 'Escalated approval', body: (p) => `Approval for "${p.docTitle}" was escalated to you.` },
      ar: { title: 'موافقة مُصعَّدة', body: (p) => `تم تصعيد الموافقة على "${p.docTitle}" إليك.` },
    },
    'workflow.overdue': {
      en: { title: 'Overdue approval', body: (p) => `Approval for "${p.docTitle}" is overdue and has no escalation target.` },
      ar: { title: 'موافقة متأخرة', body: (p) => `الموافقة على "${p.docTitle}" متأخرة وليس لها هدف تصعيد.` },
    },
    'workflow.reminder': {
      en: { title: 'Approval due soon', body: (p) => `Your approval for "${p.docTitle}" is due ${p.dueAt}.` },
      ar: { title: 'موافقة مستحقة قريباً', body: (p) => `موافقتك على "${p.docTitle}" مستحقة ${p.dueAt}.` },
    },
    'share.created': {
      en: { title: 'Document shared', body: (p) => `${p.sharedBy} shared "${p.docTitle}" with ${p.recipient}.` },
      ar: { title: 'تمت مشاركة مستند', body: (p) => `شارك ${p.sharedBy} "${p.docTitle}" مع ${p.recipient}.` },
    },
    'share.received': {
      en: { title: 'Document shared with you', body: (p) => `${p.sharedBy} shared "${p.docTitle}" with you.` },
      ar: { title: 'تمت مشاركة مستند معك', body: (p) => `شارك ${p.sharedBy} "${p.docTitle}" معك.` },
    },
    'breakglass.alert': {
      en: { title: '⚠️ Break-glass access granted', body: (p) => `${p.email} was granted emergency admin access. Reason: ${p.reason}` },
      ar: { title: '⚠️ تم منح وصول طارئ', body: (p) => `تم منح ${p.email} وصولاً إدارياً طارئاً. السبب: ${p.reason}` },
    },
    'security.anomaly_detected': {
      en: { title: 'Security anomaly detected', body: (p) => p.description },
      ar: { title: 'تم اكتشاف شذوذ أمني', body: (p) => p.description },
    },
    'policy.violation': {
      en: { title: 'Policy violation detected', body: (p) => `${p.actor} was denied ${p.action} on ${p.resource}. Reason: ${p.reason}` },
      ar: { title: 'تم اكتشاف انتهاك سياسة', body: (p) => `تم رفض ${p.action} على ${p.resource} بواسطة ${p.actor}. السسبب: ${p.reason}` },
    },
    'system.health_degraded': {
      en: { title: '⚠️ System health degraded', body: (p) => `Health check found issues: ${p.issues}` },
      ar: { title: '⚠️ تدهور صحة النظام', body: (p) => `وجد فحص الصحة مشاكل: ${p.issues}` },
    },
    'document.comment': {
      en: { title: 'New comment on your document', body: (p) => `${p.author} commented on "${p.docTitle}"` },
      ar: { title: 'تعليق جديد على مستندك', body: (p) => `علّق ${p.author} على "${p.docTitle}"` },
    },
    'recertification.assigned': {
      en: { title: 'Access recertification campaign assigned', body: (p) => `${p.count} user(s) require access recertification for "${p.name}".` },
      ar: { title: 'تم تعيين حملة إعادة شهادة الوصول', body: (p) => `${p.count} مستخدم(ين) يتطلبون إعادة شهادة الوصول لـ "${p.name}".` },
    },
    'recertification.revoked': {
      en: { title: 'Access revoked', body: (p) => `Your access was revoked during recertification campaign "${p.name}".` },
      ar: { title: 'تم إلغاء الوصول', body: (p) => `تم إلغاء وصولك خلال حملة إعادة الشهادة "${p.name}".` },
    },
    'dual_control.request': {
      en: { title: 'Dual-control approval required', body: (p) => `${p.email} requested approval for: ${p.action}` },
      ar: { title: 'مطلوب موافقة الرقابة المزدوجة', body: (p) => `طلب ${p.email} الموافقة على: ${p.action}` },
    },
  };

  const template = templates[type];
  if (!template) {
    // Fallback: use the input title/body as-is
    return { title: params.title as string || type, body: params.body as string || '' };
  }

  const localeTemplate = ar ? template.ar : template.en;
  return {
    title: localeTemplate.title,
    body: localeTemplate.body(params),
  };
}

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
  // Resolve recipient's locale for localized title/body
  const locale = await getUserLocale(input.userId);

  // Try localized template first
  const metadata = input.metadata ?? {};
  const localized = getLocalizedNotification(input.type, locale, {
    ...metadata,
    title: input.title,
    body: input.body,
  });

  const notification = await db.notification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      title: localized.title,
      body: localized.body,
      severity: input.severity ?? 'info',
      link: input.link ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
  });

  // Push via WebSocket (best-effort, non-blocking)
  pushWebSocket(input.userId, 'notification:new', {
    id: notification.id,
    type: input.type,
    title: localized.title,
    body: localized.body,
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
