'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  sequenceNum: number;
  eventType: string;
  actorEmail: string | null;
  actorIp: string | null;
  action: string;
  resourceName: string | null;
  result: 'allow' | 'deny' | 'error';
  reason: string | null;
  createdAt: string;
}

const RESULT_CONFIG = {
  allow: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500',
    ring: 'ring-emerald-500/20',
    line: 'bg-emerald-200 dark:bg-emerald-900',
  },
  deny: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-500',
    ring: 'ring-red-500/20',
    line: 'bg-red-200 dark:bg-red-900',
  },
  error: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500',
    ring: 'ring-amber-500/20',
    line: 'bg-amber-200 dark:bg-amber-900',
  },
};

// Localized event type labels
const EVENT_LABELS: Record<string, { en: string; ar: string }> = {
  'auth.login': { en: 'Sign in', ar: 'تسجيل الدخول' },
  'auth.login.deny': { en: 'Sign in denied', ar: 'رفض تسجيل الدخول' },
  'document.read': { en: 'Document viewed', ar: 'عرض المستند' },
  'document.create': { en: 'Document created', ar: 'إنشاء مستند' },
  'document.upload': { en: 'Document uploaded', ar: 'رفع مستند' },
  'document.update': { en: 'Document updated', ar: 'تحديث المستند' },
  'document.delete': { en: 'Document deleted', ar: 'حذف المستند' },
  'document.download': { en: 'Document downloaded', ar: 'تنزيل المستند' },
  'document.preview': { en: 'Document previewed', ar: 'معاينة المستند' },
  'document.redact': { en: 'Document redacted', ar: 'تنقيح المستند' },
  'document.lock': { en: 'Document locked', ar: 'قفل المستند' },
  'document.unlock': { en: 'Document unlocked', ar: 'فتح المستند' },
  'document.classify': { en: 'Classification changed', ar: 'تغيير التصنيف' },
  'share.create': { en: 'Share link created', ar: 'إنشاء رابط مشاركة' },
  'share.view': { en: 'Share viewed', ar: 'عرض المشاركة' },
  'share.revoke': { en: 'Share revoked', ar: 'إلغاء المشاركة' },
  'workflow.create': { en: 'Workflow created', ar: 'إنشاء سير عمل' },
  'workflow.approve': { en: 'Workflow approved', ar: 'موافقة على سير عمل' },
  'admin.user.create': { en: 'User created', ar: 'إنشاء مستخدم' },
  'admin.user.update': { en: 'User updated', ar: 'تحديث المستخدم' },
  'admin.user.suspend': { en: 'User suspended', ar: 'تعليق المستخدم' },
  'admin.policy.create': { en: 'Policy created', ar: 'إنشاء سياسة' },
  'admin.classification.create': { en: 'Classification created', ar: 'إنشاء تصنيف' },
  'authz.deny': { en: 'Access denied', ar: 'رفض الوصول' },
  'api.error': { en: 'API error', ar: 'خطأ في API' },
};

export function getEventLabel(eventType: string, locale: string = 'en'): string {
  const label = EVENT_LABELS[eventType];
  if (!label) return eventType;
  return locale === 'ar' ? label.ar : label.en;
}

export function AuditTimeline({ events, locale = 'en' }: { events: TimelineEvent[]; locale?: string }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No events recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute start-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-800" />

      <div className="space-y-1">
        {events.map((event, index) => {
          const config = RESULT_CONFIG[event.result] || RESULT_CONFIG.allow;
          const Icon = config.icon;
          const label = getEventLabel(event.eventType, locale);

          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.25 }}
              className="relative flex items-start gap-4 ps-0 pb-3"
            >
              {/* Node */}
              <div className={cn(
                'relative z-10 flex items-center justify-center w-8 h-8 rounded-full ring-2 bg-white dark:bg-slate-900',
                config.ring,
              )}>
                <Icon className={cn('h-4 w-4', config.color)} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                    #{event.sequenceNum}
                  </span>
                  <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                    event.result === 'allow' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                    event.result === 'deny' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' :
                    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                  )}>
                    {event.result}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  {event.actorEmail && <span>{event.actorEmail}</span>}
                  {event.resourceName && (
                    <>
                      <span>·</span>
                      <span className="truncate">{event.resourceName}</span>
                    </>
                  )}
                  {event.actorIp && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{event.actorIp}</span>
                    </>
                  )}
                </div>

                {event.reason && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">
                    "{event.reason}"
                  </p>
                )}

                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
