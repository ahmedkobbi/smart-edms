'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users as UsersIcon, Loader2, Plus, ShieldCheck, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  status: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  jobTitle: string | null;
  department: string | null;
  roleAssignments: { role: { id: string; name: string } }[];
}

const SYSTEM_ROLES = ['tenant_admin', 'records_manager', 'security_officer', 'compliance_auditor', 'end_user', 'viewer'];

export default function AdminUsersPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<UserItem | null>(null);

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  params.set('pageSize', '100');

  const { data, isLoading } = useQuery<{ items: UserItem[]; total: number }>({
    queryKey: ['admin-users', params.toString()],
    queryFn: () => api.get(`/api/admin/users?${params}`),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/users/${id}`),
    onSuccess: () => {
      toast({ title: t('admin.users.suspended') });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('admin.users.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.users.subtitle')}
          </p>
        </div>
        <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('admin.users.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9 max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <div className="p-12 text-center">
              <UsersIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">{t('admin.users.empty')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((u) => (
                <div key={u.id} className="p-4 flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs">
                      {(u.name || u.email).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{u.name || u.email}</p>
                      <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className="text-xs">{u.status}</Badge>
                      {u.mfaEnabled && (
                        <Badge variant="outline" className="text-xs">
                          <ShieldCheck className="me-1 h-3 w-3" /> MFA
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.email}
                      {u.jobTitle && ` · ${u.jobTitle}`}
                      {u.department && ` · ${u.department}`}
                      {u.lastLoginAt && ` · last login ${formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true })}`}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {u.roleAssignments.map((ra) => (
                        <Badge key={ra.role.id} variant="secondary" className="text-[10px] py-0">{ra.role.name}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                    disabled={u.status === 'suspended'}
                    onClick={() => setSuspendTarget(u)}
                  >
                    {t('common.suspend')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suspend confirmation dialog */}
      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(o) => !o && setSuspendTarget(null)}
        title={t('common.suspendUser') + '?'}
        description={t('admin.users.suspendConfirm', { email: suspendTarget?.email || '' })}
        confirmLabel={t('common.suspendUser')}
        cancelLabel={t('common.cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (!suspendTarget) return;
          await api.delete(`/api/admin/users/${suspendTarget.id}`);
          toast({ title: t('admin.users.suspended') });
          qc.invalidateQueries({ queryKey: ['admin-users'] });
        }}
      />
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('end_user');

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/users', {
      email, name,
      password: password || undefined,
      jobTitle: jobTitle || undefined,
      department: department || undefined,
      roleNames: [role],
    }),
    onSuccess: (res: any) => {
      toast({
        title: t('admin.users.userCreatedToast'),
        description: res.temporaryPassword ? t('admin.users.temporaryPasswordPrefix', { password: res.temporaryPassword }) : undefined,
      });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      onOpenChange(false);
      setEmail(''); setName(''); setPassword(''); setJobTitle(''); setDepartment(''); setRole('end_user');
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="me-2 h-4 w-4" /> {t('admin.users.newUser')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('admin.users.createUser')}</DialogTitle>
          <DialogDescription>{t('admin.users.createUserDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>{t('admin.users.emailLabel')}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('admin.users.nameLabel')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('admin.users.passwordOptional')}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordMinHint')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t('admin.users.jobTitle')}</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('admin.users.department')}</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('admin.users.role')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SYSTEM_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => create.mutate()} disabled={!email || !name || create.isPending}>
            {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
