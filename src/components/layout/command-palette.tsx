'use client';

import { useRouter } from 'next/navigation';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { FileText, Search, GitBranch, ScrollText, Settings, LayoutDashboard, Users, KeyRound, BookMarked, ShieldCheck, FileLock, Clock, Shield, Upload, Plus, Bell } from 'lucide-react';
import { useSessionData } from '@/components/providers/use-session-data';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions.client';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { session } = useSessionData();
  const perms = session?.user?.permissions ?? [];

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => go('/documents?action=upload')}>
            <Upload className="mr-2 h-4 w-4" />
            Upload document
          </CommandItem>
          <CommandItem onSelect={() => go('/search')}>
            <Search className="mr-2 h-4 w-4" />
            Search documents
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go('/dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go('/documents')}>
            <FileText className="mr-2 h-4 w-4" />
            Documents
          </CommandItem>
          {hasPermission(perms, PERMISSIONS.WORKFLOW_APPROVE) && (
            <CommandItem onSelect={() => go('/workflows')}>
              <GitBranch className="mr-2 h-4 w-4" />
              Workflows
            </CommandItem>
          )}
          {hasPermission(perms, PERMISSIONS.AUDIT_READ) && (
            <CommandItem onSelect={() => go('/audit')}>
              <ScrollText className="mr-2 h-4 w-4" />
              Audit log
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
