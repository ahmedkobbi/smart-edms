'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Users, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminGroupsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-groups'],
    queryFn: () => api.get('/api/admin/groups'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/groups', { ...form, memberIds: [] }),
    onSuccess: () => {
      toast({ title: 'Group created' });
      qc.invalidateQueries({ queryKey: ['admin-groups'] });
      setCreateOpen(false);
      setForm({ name: '', description: '' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/groups/${id}`),
    onSuccess: () => {
      toast({ title: 'Group deleted' });
      qc.invalidateQueries({ queryKey: ['admin-groups'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.groups')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group users for policy targeting and bulk role assignment.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> New group</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create group</DialogTitle>
              <DialogDescription>Members can be added after creation.</DialogDescription>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Groups</CardTitle>
          <CardDescription>Used by ABAC policies for group-based rules</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No groups created.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((g) => (
                <div key={g.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{g.name}</p>
                      <Badge variant="secondary" className="text-xs">{g._count?.members ?? 0} member(s)</Badge>
                      <Badge variant="outline" className="text-xs">{g._count?.policies ?? 0} polic(ies)</Badge>
                    </div>
                    {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => del.mutate(g.id)}>
                    <Trash2 className="me-1 h-3 w-3" /> Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
