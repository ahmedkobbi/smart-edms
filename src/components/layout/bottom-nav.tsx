'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, Search, Bell, Settings } from 'lucide-react';
import { useSessionData } from '@/components/providers/use-session-data';
import { useI18n } from '@/i18n/use-i18n';

/**
 * Bottom navigation for mobile.
 *
 * Visible only on `md:hidden` (below 768px). Shows the top 5 navigation
 * destinations for quick access without opening the sidebar drawer.
 *
 * Uses safe-area-inset-bottom to avoid collision with the iPhone home
 * indicator on notch devices.
 */

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { href: '/documents', icon: FileText, labelKey: 'nav.documents' },
  { href: '/search', icon: Search, labelKey: 'nav.search' },
  { href: '/notifications', icon: Bell, labelKey: 'nav.notifications' },
  { href: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

export function BottomNav() {
  const pathname = usePathname();
  const { session } = useSessionData();
  const { t } = useI18n();

  // Don't render if not authenticated (login page has no bottom nav)
  if (!session) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-white/10 dark:border-white/5"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label={t('common.mobileNavAria')}
    >
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[44px] min-h-[44px] transition-colors ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={t(item.labelKey)}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
