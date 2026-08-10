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

// Localized event type labels — now uses the comprehensive auto-generated
// label file covering 128 event types × 5 locales (en, fr, ar, es, de).
import { getAuditEventLabel } from './audit-event-labels';

export function getEventLabel(eventType: string, locale: string = 'en'): string {
  return getAuditEventLabel(eventType, locale);
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
