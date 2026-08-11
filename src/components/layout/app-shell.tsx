'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { BottomNav } from '@/components/layout/bottom-nav';
import { SubscriptionBanner } from '@/components/layout/subscription-banner';
import { useSessionData } from '@/components/providers/use-session-data';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import { DualSpinner } from '@/components/ui/premium';
import { useI18n } from '@/i18n/use-i18n';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, status } = useSessionData();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // P3: Register the push notification service worker.
  // Only registers in production (dev mode SW caching causes stale content).
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-push.js', { scope: '/' })
        .then(() => {
          // SW registered — push notifications are now active
        })
        .catch((err) => {
          console.warn('[SW] registration failed:', err);
        });
    }
  }, []);

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-bg">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <DualSpinner />
          <p className="text-sm text-muted-foreground animate-pulse">{t('common.loadingApp')}</p>
        </motion.div>
      </div>
    );
  }

  return (
    // P5: MotionConfig reducedMotion="user" — respects prefers-reduced-motion
    // (WCAG 2.3.3). When the user has the OS setting enabled, Framer Motion
    // disables all animations automatically.
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex mesh-bg">
        {/* Skip to content — accessibility (WCAG 2.4.1) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:rounded-md focus:text-sm"
        >
          {t('common.skipToContent')}
        </a>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <SubscriptionBanner />
          <TopBar />
          <main id="main-content" className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-6">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              {children}
            </motion.div>
          </main>
        </div>
        {/* P10: Bottom navigation — visible only on mobile (md:hidden) */}
        <BottomNav />
      </div>
    </MotionConfig>
  );
}
