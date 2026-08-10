'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Search, LogOut, User as UserIcon, Settings, ChevronDown, Command } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api/client';
import { useSessionData } from '@/components/providers/use-session-data';
import { signOut } from 'next-auth/react';
import { CommandPalette } from '@/components/layout/command-palette';
import { useWebSocketNotifications } from '@/hooks/use-websocket-notifications';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function TopBar() {
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useSessionData();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { connected: wsConnected } = useWebSocketNotifications();
  const { t } = useI18n();

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Poll less frequently when WebSocket is connected (WS handles real-time push)
  const { data: notifData } = useQuery<{ items: Notification[]; unreadCount: number }>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/api/notifications'),
    refetchInterval: wsConnected ? 120_000 : 30_000, // 2min with WS, 30s without
  });

  const readAll = useMutation({
    mutationFn: () => api.post('/api/notifications'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const user = session?.user;
  const initials = (user?.name || user?.email || '?').slice(0, 2).toUpperCase();

  return (
    <>
      <header
        className="glass border-b border-white/10 dark:border-white/5 sticky top-0 z-30"
        style={{ paddingTop: 'var(--safe-top)', height: 'calc(3.5rem + var(--safe-top))' }}
      >
        <div className="h-full px-4 ps-14 md:ps-4 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <button
              onClick={() => setPaletteOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-800 transition-colors"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-start">{t('common.search')}…</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={t('common.notifications')}>
                  <Bell className="h-4 w-4" />
                  {notifData?.unreadCount ? (
                    <span className="absolute top-1 end-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
                      {notifData.unreadCount > 99 ? '99+' : notifData.unreadCount}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
                  <p className="text-sm font-medium">{t('common.notifications')}</p>
                  {notifData?.unreadCount ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => readAll.mutate()}
                    >
                      {t('common.markAllRead')}
                    </Button>
                  ) : null}
                </div>
                <ScrollArea className="h-80">
                  {notifData?.items?.length ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-900">
                      {notifData.items.map((n) => (
                        <Link
                          key={n.id}
                          href={n.link || '#'}
                          className="block p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            {!n.readAt && (
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{n.title}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {t('common.noNotifications')}
                    </div>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 px-2 gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium truncate">{user?.name || user?.email}</span>
                    <span className="text-xs text-muted-foreground font-normal truncate">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <UserIcon className="ms-2 h-4 w-4" />
                  {t('common.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/settings/security')}>
                  <Settings className="ms-2 h-4 w-4" />
                  {t('common.security')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    // Call the custom logout endpoint to:
                    //   1. Revoke the JWT (add jti to RevokedSession denylist)
                    //   2. Record the auth.logout audit event
                    //   3. Clear the session cookie
                    // Then redirect to /login (signOut clears the NextAuth cookie state)
                    try {
                      await fetch('/api/auth/logout', { method: 'POST' });
                    } catch {
                      // Best-effort — even if the API call fails, clear the cookie client-side
                    }
                    signOut({ callbackUrl: '/login', redirect: true });
                  }}
                  className="text-red-600 dark:text-red-400"
                >
                  <LogOut className="ms-2 h-4 w-4" />
                  {t('common.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
