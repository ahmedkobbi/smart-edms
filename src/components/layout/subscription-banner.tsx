'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { AlertTriangle, Lock, Clock, CreditCard, Upload, X } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AccessStatus {
  mode: 'saas' | 'onprem';
  level: 'full' | 'read_only' | 'locked';
  status: string;
  message?: string;
  gracePeriodEndsAt?: string;
  dataExportDeadline?: string;
  plan?: string;
}

export function SubscriptionBanner() {
  const { t } = useI18n();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery<AccessStatus>({
    queryKey: ['access-status'],
    queryFn: () => api.get('/api/access-status'),
    refetchInterval: 60_000, // refresh every minute
    retry: false,
  });

  if (!data || data.level === 'full' || dismissed) return null;

  const isLocked = data.level === 'locked';
  const isReadOnly = data.level === 'read_only';

  const bg = isLocked
    ? 'bg-red-500/10 border-red-500/30'
    : 'bg-amber-500/10 border-amber-500/30';

  const iconColor = isLocked ? 'text-red-600' : 'text-amber-600';
  const Icon = isLocked ? Lock : AlertTriangle;

  const actionLabel = data.mode === 'onprem' ? t('subscription.uploadLicense') : t('subscription.renewNow');
  const actionHref = data.mode === 'onprem' ? '/admin/license' : '/admin/billing';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`fixed top-0 left-0 right-0 z-50 border-b ${bg} backdrop-blur-md`}
      >
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {isLocked
                  ? t('subscription.lockedTitle')
                  : t('subscription.readOnlyTitle')}
              </p>
              {data.message && (
                <p className="text-xs text-muted-foreground truncate">{data.message}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {data.gracePeriodEndsAt && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(data.gracePeriodEndsAt).toLocaleDateString()}
              </span>
            )}
            <button
              onClick={() => router.push(actionHref)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              {data.mode === 'onprem' ? <Upload className="h-3.5 w-3.5" /> : <CreditCard className="h-3.5 w-3.5" />}
              {actionLabel}
            </button>
            {!isLocked && (
              <button
                onClick={() => setDismissed(true)}
                className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
