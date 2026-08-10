'use client';

import { useRouter } from 'next/navigation';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { FileText, Search, GitBranch, ScrollText, Settings, LayoutDashboard, Users, KeyRound, BookMarked, ShieldCheck, FileLock, Clock, Shield, Upload, Plus, Bell, FolderOpen } from 'lucide-react';
import { useSessionData } from '@/components/providers/use-session-data';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions.client';
import { useI18n } from '@/i18n/use-i18n';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { session } = useSessionData();
  const { t } = useI18n();
  const perms = session?.user?.permissions ?? [];

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t('common.search')} />
      <CommandList>
        <CommandEmpty>{t('common.noResults')}</CommandEmpty>

        <CommandGroup heading={t('nav.workspace')}>
          <CommandItem onSelect={() => go('/documents?action=upload')}>
            <Upload className="mr-2 h-4 w-4" />
            {t('documents.uploadDocument')}
          </CommandItem>
          <CommandItem onSelect={() => go('/search')}>
            <Search className="mr-2 h-4 w-4" />
            {t('nav.search')}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t('nav.governance')}>
          <CommandItem onSelect={() => go('/dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            {t('nav.dashboard')}
          </CommandItem>
          <CommandItem onSelect={() => go('/documents')}>
            <FileText className="mr-2 h-4 w-4" />
            {t('nav.documents')}
          </CommandItem>
          <CommandItem onSelect={() => go('/folders')}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {t('nav.folders')}
          </CommandItem>
          <CommandItem onSelect={() => go('/search')}>
            <Search className="mr-2 h-4 w-4" />
            {t('nav.search')}
          </CommandItem>
          {hasPermission(perms, PERMISSIONS.WORKFLOW_APPROVE) && (
            <CommandItem onSelect={() => go('/workflows')}>
              <GitBranch className="mr-2 h-4 w-4" />
              {t('nav.workflows')}
            </CommandItem>
          )}
          {hasPermission(perms, PERMISSIONS.AUDIT_READ) && (
            <CommandItem onSelect={() => go('/audit')}>
              <ScrollText className="mr-2 h-4 w-4" />
              {t('nav.auditLog')}
            </CommandItem>
          )}
        </CommandGroup>

        {hasPermission(perms, PERMISSIONS.ADMIN_VIEW) && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Administration">
              <CommandItem onSelect={() => go('/admin/users')}>
                <Users className="mr-2 h-4 w-4" />
                Users
              </CommandItem>
              <CommandItem onSelect={() => go('/admin/roles')}>
                <KeyRound className="mr-2 h-4 w-4" />
                Roles
              </CommandItem>
              <CommandItem onSelect={() => go('/admin/classifications')}>
                <BookMarked className="mr-2 h-4 w-4" />
                Classifications
              </CommandItem>
              <CommandItem onSelect={() => go('/admin/policies')}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Policies
              </CommandItem>
              {hasPermission(perms, PERMISSIONS.LEGAL_HOLD_MANAGE) && (
                <CommandItem onSelect={() => go('/admin/legal-holds')}>
                  <FileLock className="mr-2 h-4 w-4" />
                  Legal holds
                </CommandItem>
              )}
              {hasPermission(perms, PERMISSIONS.RETENTION_MANAGE) && (
                <CommandItem onSelect={() => go('/admin/retention')}>
                  <Clock className="mr-2 h-4 w-4" />
                  Retention schedules
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem onSelect={() => go('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
          <CommandItem onSelect={() => go('/settings/security')}>
            <Shield className="mr-2 h-4 w-4" />
            Security
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
