'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { ShieldCheck, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export default function AdminPoliciesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', effect: 'deny', action: '', resource: '', priority: '100',
  });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-policies'],
    queryFn: () => api.get('/api/admin/policies'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/policies', {
      ...form,
      priority: parseInt(form.priority, 10),
      conditions: {},
    }),
    onSuccess: () => {
      toast({ title: 'Policy created' });
      qc.invalidateQueries({ queryKey: ['admin-policies'] });
      setCreateOpen(false);
      setForm({ name: '', description: '', effect: 'deny', action: '', resource: '', priority: '100' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/policies/${id}`),
    onSuccess: () => {
      toast({ title: 'Policy deleted' });
      qc.invalidateQueries({ queryKey: ['admin-policies'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/admin/policies/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-policies'] }),
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ABAC rules evaluated alongside RBAC permissions.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New policy</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create policy</DialogTitle>
              <DialogDescription>Higher priority is evaluated first. Deny wins over allow at the same level.</DialogDescription>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Effect</Label>
                  <Select value={form.effect} onValueChange={(v) => setForm({ ...form, effect: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">Allow</SelectItem>
                      <SelectItem value="deny">Deny</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <Input type="number" min="0" max="1000" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Action (e.g. document:download, share:create, *)</Label>
                <Input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} placeholder="document:download" />
              </div>
              <div className="space-y-1">
                <Label>Resource (e.g. document:*)</Label>
                <Input value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value })} placeholder="document:*" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || !form.action || !form.resource || create.isPending}>
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
            <ShieldCheck className="h-4 w-4" /> Policies
          </CardTitle>
          <CardDescription>Evaluated in priority order (highest first)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No policies defined.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((p) => (
                <div key={p.id} className="p-4 flex items-start gap-3">
                  <Badge variant={p.effect === 'deny' ? 'destructive' : 'default'} className="mt-0.5">{p.effect}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{p.name}</p>
                      <Badge variant="secondary" className="text-xs">Priority {p.priority}</Badge>
                      {!p.enabled && <Badge variant="outline" className="text-xs">Disabled</Badge>}
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                    <p className="text-xs font-mono mt-1">
                      <span className="text-muted-foreground">action:</span> {p.action}{' '}
                      <span className="text-muted-foreground">resource:</span> {p.resource}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => toggle.mutate({ id: p.id, enabled: !p.enabled })}
                    >
                      {p.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => del.mutate(p.id)}>
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
