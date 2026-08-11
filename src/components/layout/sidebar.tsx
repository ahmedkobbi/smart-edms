'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Shield, FileText, Search, GitBranch, Clock, FileLock, ScrollText, Settings,
  LayoutDashboard, Users, ShieldCheck, BookMarked, KeyRound, Webhook, Database,
  Bot, ShieldAlert, FileCheck, Smartphone, Mail, BookOpen, LogIn, RefreshCw,
  AlertTriangle, CreditCard, Building2, FolderOpen, Menu, X, Code2, Globe,
  Bell, Activity, PenTool, Workflow, FolderTree, ShieldCheck as ShieldCheckIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSessionData } from '@/components/providers/use-session-data';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions.client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/use-i18n';

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

const NAV_GROUPS: { titleKey: string; items: NavItem[] }[] = [
  {
    titleKey: 'nav.workspace',
    items: [
      { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { href: '/documents', labelKey: 'nav.documents', icon: FileText, permission: PERMISSIONS.SEARCH_USE },
      { href: '/folders', labelKey: 'nav.folders', icon: FolderOpen, permission: PERMISSIONS.SEARCH_USE },
      { href: '/search', labelKey: 'nav.search', icon: Search, permission: PERMISSIONS.SEARCH_USE },
      { href: '/workflows', labelKey: 'nav.workflows', icon: GitBranch, permission: PERMISSIONS.WORKFLOW_APPROVE },
    ],
  },
  {
    titleKey: 'nav.platform',
    items: [
      { href: '/admin/platform', labelKey: 'nav.platformDashboard', icon: Globe, permission: PERMISSIONS.ADMIN_PLATFORM_VIEW_ALL },
      { href: '/admin/tenants', labelKey: 'nav.tenants', icon: Building2, permission: PERMISSIONS.ADMIN_PLATFORM_VIEW_ALL },
    ],
  },
  {
    titleKey: 'nav.governance',
    items: [
      { href: '/audit', labelKey: 'nav.auditLog', icon: ScrollText, permission: PERMISSIONS.AUDIT_READ },
      { href: '/admin/legal-holds', labelKey: 'nav.legalHolds', icon: FileLock, permission: PERMISSIONS.LEGAL_HOLD_MANAGE },
      { href: '/admin/retention', labelKey: 'nav.retention', icon: Clock, permission: PERMISSIONS.RETENTION_MANAGE },
      { href: '/admin/dispositions', labelKey: 'nav.dispositions', icon: FileCheck, permission: PERMISSIONS.RETENTION_MANAGE },
      { href: '/admin/records-management', labelKey: 'nav.recordsManagement', icon: FolderTree, permission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
      { href: '/admin/security-audit', labelKey: 'nav.securityAudit', icon: ShieldCheckIcon, permission: PERMISSIONS.SECURITY_AUDIT_READ },
    ],
  },
  {
    titleKey: 'nav.administration',
    items: [
      { href: '/admin/security', labelKey: 'nav.securityPosture', icon: ShieldAlert, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/anomalies', labelKey: 'nav.anomalies', icon: AlertTriangle, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/notification-routing', labelKey: 'admin.notificationRouting', icon: Bell, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/jobs', labelKey: 'admin.jobs.title', icon: Activity, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/break-glass', labelKey: 'admin.breakGlass.title', icon: ShieldAlert, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/dual-control', labelKey: 'admin.dualControl', icon: ShieldCheck, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/users', labelKey: 'nav.users', icon: Users, permission: PERMISSIONS.ADMIN_USERS_MANAGE },
      { href: '/admin/invitations', labelKey: 'nav.invitations', icon: Mail, permission: PERMISSIONS.ADMIN_USERS_MANAGE },
      { href: '/admin/groups', labelKey: 'nav.groups', icon: Users, permission: PERMISSIONS.ADMIN_GROUPS_MANAGE },
      { href: '/admin/roles', labelKey: 'nav.roles', icon: KeyRound, permission: PERMISSIONS.ADMIN_ROLES_MANAGE },
      { href: '/admin/recertification', labelKey: 'nav.recertification', icon: RefreshCw, permission: PERMISSIONS.ADMIN_USERS_MANAGE },
      { href: '/admin/developer', labelKey: 'admin.developer', icon: Code2, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/locales', labelKey: 'admin.locales', icon: Globe, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/classifications', labelKey: 'nav.classifications', icon: BookMarked, permission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE },
      { href: '/admin/policies', labelKey: 'nav.policies', icon: ShieldCheck, permission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
      { href: '/admin/metadata-schemas', labelKey: 'nav.metadataSchemas', icon: Database, permission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
      { href: '/admin/vocabularies', labelKey: 'nav.vocabularies', icon: BookOpen, permission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
      { href: '/admin/api-keys', labelKey: 'nav.apiKeys', icon: KeyRound, permission: PERMISSIONS.ADMIN_API_KEYS_MANAGE },
      { href: '/admin/service-accounts', labelKey: 'nav.serviceAccounts', icon: Bot, permission: PERMISSIONS.ADMIN_API_KEYS_MANAGE },
      { href: '/admin/webhooks', labelKey: 'nav.webhooks', icon: Webhook, permission: PERMISSIONS.ADMIN_WEBHOOKS_MANAGE },
      { href: '/admin/sso-providers', labelKey: 'nav.ssoProviders', icon: LogIn, permission: PERMISSIONS.ADMIN_INTEGRATIONS_MANAGE },
      { href: '/admin/signatures', labelKey: 'nav.signatures', icon: PenTool, permission: PERMISSIONS.SIGNATURE_READ },
      { href: '/admin/bpmn-designer', labelKey: 'nav.bpmnDesigner', icon: Workflow, permission: PERMISSIONS.BPMN_DESIGN_VIEW },
      { href: '/admin/devices', labelKey: 'nav.devices', icon: Smartphone, permission: PERMISSIONS.ADMIN_USERS_MANAGE },
      { href: '/admin/tenant', labelKey: 'nav.tenantSettings', icon: Settings, permission: PERMISSIONS.ADMIN_TENANT_MANAGE },
      { href: '/admin/billing', labelKey: 'nav.billing', icon: CreditCard, permission: PERMISSIONS.ADMIN_TENANT_MANAGE },
    ],
  },
  {
    titleKey: 'nav.account',
    items: [
      { href: '/settings', labelKey: 'nav.settings', icon: Settings },
      { href: '/settings/locale', labelKey: 'admin.localePrefs', icon: Globe },
      { href: '/settings/sessions', labelKey: 'admin.sessions', icon: Smartphone },
    ],
  },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { session } = useSessionData();
  const { t } = useI18n();
  const perms = session?.user?.permissions ?? [];

  return (
    <>
      <div className="h-14 flex items-center gap-2 px-4 border-b border-white/10 dark:border-white/5">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
          <div className="relative">
            <div className="absolute inset-0 blur-md opacity-30 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg" />
            <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-400 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white dark:text-slate-900" />
            </div>
          </div>
          <span className="font-semibold tracking-tight gradient-text">Smart EDMS</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6 scrollbar-premium">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.permission || hasPermission(perms, i.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.titleKey}>
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {t(group.titleKey)}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                        active
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-slate-50 dark:hover:bg-slate-900',
                      )}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 dark:border-white/5">
        <Link
          href="/settings"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-900"
        >
          <Shield className="h-3.5 w-3.5" />
          <span className="truncate">Security &amp; privacy</span>
        </Link>
      </div>
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col glass border-e border-white/10 dark:border-white/5 h-screen sticky top-0 z-40">
        <SidebarContent />
      </aside>

      {/* Mobile hamburger trigger (rendered in TopBar area) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden fixed top-2 start-2 z-50 glass"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 glass">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-sm font-medium">{t('common.navigation')}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
