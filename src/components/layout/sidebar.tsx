'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield, FileText, Search, GitBranch, Clock, FileLock, ScrollText, Settings,
  LayoutDashboard, Users, ShieldCheck, BookMarked, KeyRound, Webhook, Database,
  Bot, ShieldAlert, FileCheck, Smartphone, Mail, BookOpen, LogIn, RefreshCw,
  AlertTriangle, CreditCard, Building2, FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSessionData } from '@/components/providers/use-session-data';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions.client';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/documents', label: 'Documents', icon: FileText, permission: PERMISSIONS.SEARCH_USE },
      { href: '/folders', label: 'Folders', icon: FolderOpen, permission: PERMISSIONS.SEARCH_USE },
      { href: '/search', label: 'Search', icon: Search, permission: PERMISSIONS.SEARCH_USE },
      { href: '/workflows', label: 'Workflows', icon: GitBranch, permission: PERMISSIONS.WORKFLOW_APPROVE },
    ],
  },
  {
    title: 'Governance',
    items: [
      { href: '/audit', label: 'Audit Log', icon: ScrollText, permission: PERMISSIONS.AUDIT_READ },
      { href: '/admin/legal-holds', label: 'Legal Holds', icon: FileLock, permission: PERMISSIONS.LEGAL_HOLD_MANAGE },
      { href: '/admin/retention', label: 'Retention', icon: Clock, permission: PERMISSIONS.RETENTION_MANAGE },
      { href: '/admin/dispositions', label: 'Dispositions', icon: FileCheck, permission: PERMISSIONS.RETENTION_MANAGE },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/admin/security', label: 'Security Posture', icon: ShieldAlert, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/anomalies', label: 'Anomalies', icon: AlertTriangle, permission: PERMISSIONS.ADMIN_VIEW },
      { href: '/admin/users', label: 'Users', icon: Users, permission: PERMISSIONS.ADMIN_USERS_MANAGE },
      { href: '/admin/invitations', label: 'Invitations', icon: Mail, permission: PERMISSIONS.ADMIN_USERS_MANAGE },
      { href: '/admin/groups', label: 'Groups', icon: Users, permission: PERMISSIONS.ADMIN_GROUPS_MANAGE },
      { href: '/admin/roles', label: 'Roles', icon: KeyRound, permission: PERMISSIONS.ADMIN_ROLES_MANAGE },
      { href: '/admin/recertification', label: 'Recertification', icon: RefreshCw, permission: PERMISSIONS.ADMIN_USERS_MANAGE },
      { href: '/admin/classifications', label: 'Classifications', icon: BookMarked, permission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE },
      { href: '/admin/policies', label: 'Policies', icon: ShieldCheck, permission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
      { href: '/admin/metadata-schemas', label: 'Metadata Schemas', icon: Database, permission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
      { href: '/admin/vocabularies', label: 'Vocabularies', icon: BookOpen, permission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
      { href: '/admin/api-keys', label: 'API Keys', icon: KeyRound, permission: PERMISSIONS.ADMIN_API_KEYS_MANAGE },
      { href: '/admin/service-accounts', label: 'Service Accounts', icon: Bot, permission: PERMISSIONS.ADMIN_API_KEYS_MANAGE },
      { href: '/admin/webhooks', label: 'Webhooks', icon: Webhook, permission: PERMISSIONS.ADMIN_WEBHOOKS_MANAGE },
      { href: '/admin/sso-providers', label: 'SSO Providers', icon: LogIn, permission: PERMISSIONS.ADMIN_INTEGRATIONS_MANAGE },
      { href: '/admin/devices', label: 'Devices', icon: Smartphone, permission: PERMISSIONS.ADMIN_USERS_MANAGE },
      { href: '/admin/tenants', label: 'Tenants', icon: Building2, permission: PERMISSIONS.ADMIN_TENANT_MANAGE },
      { href: '/admin/tenant', label: 'Tenant Settings', icon: Settings, permission: PERMISSIONS.ADMIN_TENANT_MANAGE },
      { href: '/admin/billing', label: 'Billing', icon: CreditCard, permission: PERMISSIONS.ADMIN_TENANT_MANAGE },
    ],
  },
  {
    title: 'Account',
    items: [{ href: '/settings', label: 'Settings', icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { session } = useSessionData();
  const perms = session?.user?.permissions ?? [];

  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 h-screen sticky top-0">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-slate-200 dark:border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-400 flex items-center justify-center">
            <Shield className="h-4 w-4 text-white dark:text-slate-900" />
          </div>
          <span className="font-semibold tracking-tight">Smart EDMS</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.permission || hasPermission(perms, i.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                        active
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-slate-50 dark:hover:bg-slate-900',
                      )}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800">
        <Link
          href="/settings"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-900"
        >
          <Shield className="h-3.5 w-3.5" />
          <span className="truncate">Security &amp; privacy</span>
        </Link>
      </div>
    </aside>
  );
}
