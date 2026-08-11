'use client';

import { useRouter } from 'next/navigation';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { FileText, Search, GitBranch, ScrollText, Settings, LayoutDashboard, Users, KeyRound, BookMarked, ShieldCheck, FileLock, Clock, Shield, Upload, Plus, Bell, FolderOpen, FolderTree, PenTool, Workflow } from 'lucide-react';
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
            <Upload className="ms-2 h-4 w-4" />
            {t('documents.uploadDocument')}
          </CommandItem>
          <CommandItem onSelect={() => go('/search')}>
            <Search className="ms-2 h-4 w-4" />
            {t('nav.search')}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t('nav.governance')}>
          <CommandItem onSelect={() => go('/dashboard')}>
            <LayoutDashboard className="ms-2 h-4 w-4" />
            {t('nav.dashboard')}
          </CommandItem>
          <CommandItem onSelect={() => go('/documents')}>
            <FileText className="ms-2 h-4 w-4" />
            {t('nav.documents')}
          </CommandItem>
          <CommandItem onSelect={() => go('/folders')}>
            <FolderOpen className="ms-2 h-4 w-4" />
            {t('nav.folders')}
          </CommandItem>
          <CommandItem onSelect={() => go('/search')}>
            <Search className="ms-2 h-4 w-4" />
            {t('nav.search')}
          </CommandItem>
          {hasPermission(perms, PERMISSIONS.WORKFLOW_APPROVE) && (
            <CommandItem onSelect={() => go('/workflows')}>
              <GitBranch className="ms-2 h-4 w-4" />
              {t('nav.workflows')}
            </CommandItem>
          )}
          {hasPermission(perms, PERMISSIONS.AUDIT_READ) && (
            <CommandItem onSelect={() => go('/audit')}>
              <ScrollText className="ms-2 h-4 w-4" />
              {t('nav.auditLog')}
            </CommandItem>
          )}
        </CommandGroup>

        {hasPermission(perms, PERMISSIONS.ADMIN_VIEW) && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('common.administration')}>
              <CommandItem onSelect={() => go('/admin/users')}>
                <Users className="ms-2 h-4 w-4" />
                {t('admin.users.title')}
              </CommandItem>
              <CommandItem onSelect={() => go('/admin/roles')}>
                <KeyRound className="ms-2 h-4 w-4" />
                {t('nav.roles')}
              </CommandItem>
              <CommandItem onSelect={() => go('/admin/classifications')}>
                <BookMarked className="ms-2 h-4 w-4" />
                {t('nav.classifications')}
              </CommandItem>
              <CommandItem onSelect={() => go('/admin/policies')}>
                <ShieldCheck className="ms-2 h-4 w-4" />
                {t('nav.policies')}
              </CommandItem>
              {hasPermission(perms, PERMISSIONS.LEGAL_HOLD_MANAGE) && (
                <CommandItem onSelect={() => go('/admin/legal-holds')}>
                  <FileLock className="ms-2 h-4 w-4" />
                  {t('nav.legalHolds')}
                </CommandItem>
              )}
              {hasPermission(perms, PERMISSIONS.RETENTION_MANAGE) && (
                <CommandItem onSelect={() => go('/admin/retention')}>
                  <Clock className="ms-2 h-4 w-4" />
                  {t('nav.retention')}
                </CommandItem>
              )}
              {hasPermission(perms, PERMISSIONS.RECORD_CATEGORY_MANAGE) && (
                <CommandItem onSelect={() => go('/admin/records-management')}>
                  <FolderTree className="ms-2 h-4 w-4" />
                  {t('nav.recordsManagement')}
                </CommandItem>
              )}
              {hasPermission(perms, PERMISSIONS.SECURITY_AUDIT_READ) && (
                <CommandItem onSelect={() => go('/admin/security-audit')}>
                  <ShieldCheck className="ms-2 h-4 w-4" />
                  {t('nav.securityAudit')}
                </CommandItem>
              )}
              {hasPermission(perms, PERMISSIONS.SIGNATURE_READ) && (
                <CommandItem onSelect={() => go('/admin/signatures')}>
                  <PenTool className="ms-2 h-4 w-4" />
                  {t('nav.signatures')}
                </CommandItem>
              )}
              {hasPermission(perms, PERMISSIONS.BPMN_DESIGN_VIEW) && (
                <CommandItem onSelect={() => go('/admin/bpmn-designer')}>
                  <Workflow className="ms-2 h-4 w-4" />
                  {t('nav.bpmnDesigner')}
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading={t('common.account')}>
          <CommandItem onSelect={() => go('/settings')}>
            <Settings className="ms-2 h-4 w-4" />
            {t('nav.settings')}
          </CommandItem>
          <CommandItem onSelect={() => go('/settings/security')}>
            <Shield className="ms-2 h-4 w-4" />
            {t('common.security')}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
