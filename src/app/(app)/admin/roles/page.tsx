'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { PERMISSIONS } from '@/lib/auth/permissions.client';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminRolesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] as string[] });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-roles'],
    queryFn: () => api.get('/api/admin/roles'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/roles', form),
    onSuccess: () => {
      toast({ title: 'Role created' });
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
      setCreateOpen(false);
      setForm({ name: '', description: '', permissions: [] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/roles/${id}`),
    onSuccess: () => {
      toast({ title: 'Role deleted' });
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.roles')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage RBAC roles and their permission grants.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New role</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create role</DialogTitle>
              <DialogDescription>Custom roles can be assigned to users and groups.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Permissions</Label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md p-2 space-y-1">
                  {Object.values(PERMISSIONS).map((p) => (
                    <label key={p} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(p)}
                        onChange={(e) => {
                          if (e.target.checked) setForm({ ...form, permissions: [...form.permissions, p] });
                          else setForm({ ...form, permissions: form.permissions.filter((x) => x !== p) });
                        }}
                      />
                      <span className="font-mono">{p}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{form.permissions.length} selected</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Roles
          </CardTitle>
          <CardDescription>System roles ship with predefined permissions and cannot be deleted.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data?.items.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-medium">{r.name}</p>
                    {r.isSystem && <Badge variant="outline" className="text-xs">System</Badge>}
                    <Badge variant="secondary" className="text-xs">{r._count?.assignments ?? 0} user(s)</Badge>
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mb-2">{r.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    {(r.permissions || []).slice(0, 12).map((p: string) => (
                      <Badge key={p} variant="outline" className="font-mono text-[10px] py-0">{p}</Badge>
                    ))}
                    {(r.permissions || []).length > 12 && (
                      <Badge variant="outline" className="text-[10px] py-0">+{r.permissions.length - 12} more</Badge>
                    )}
                  </div>
                  {!r.isSystem && (
                    <Button variant="ghost" size="sm" className="mt-2 text-red-600 h-7" onClick={() => del.mutate(r.id)}>
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
