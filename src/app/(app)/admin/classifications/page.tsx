'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { BookMarked, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export default function AdminClassificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '', level: '1', color: '#2563eb' });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-classifications'],
    queryFn: () => api.get('/api/admin/classifications'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/classifications', {
      code: form.code.toUpperCase(),
      name: form.name,
      description: form.description || undefined,
      level: parseInt(form.level, 10),
      color: form.color,
    }),
    onSuccess: () => {
      toast({ title: 'Classification created' });
      qc.invalidateQueries({ queryKey: ['admin-classifications'] });
      qc.invalidateQueries({ queryKey: ['classifications'] });
      setCreateOpen(false);
      setForm({ code: '', name: '', description: '', level: '1', color: '#2563eb' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/classifications/${id}`),
    onSuccess: () => {
      toast({ title: 'Classification deleted' });
      qc.invalidateQueries({ queryKey: ['admin-classifications'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Classifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sensitivity taxonomy used for access control and visual banners.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New classification</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create classification</DialogTitle>
              <DialogDescription>Codes are uppercase, immutable after creation.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Code *</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CONFIDENTIAL" maxLength={32} />
                </div>
                <div className="space-y-1">
                  <Label>Level</Label>
                  <Input type="number" min="0" max="99" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Color (banner)</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-16 h-10 p-1" />
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1 font-mono" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.code || !form.name || create.isPending}>
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
            <BookMarked className="h-4 w-4" /> Taxonomy
          </CardTitle>
          <CardDescription>Sorted by sensitivity level (lowest → highest)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data?.items.map((c) => (
                <div key={c.id} className="p-4 flex items-center gap-3">
                  <div className="h-8 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{c.name}</p>
                      <Badge variant="outline" className="font-mono text-xs">{c.code}</Badge>
                      <Badge variant="secondary" className="text-xs">Level {c.level}</Badge>
                      {c.isSystem && <Badge variant="outline" className="text-xs">System</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.description ?? 'No description'}</p>
                    <p className="text-xs text-muted-foreground">{c._count?.documents ?? 0} document(s)</p>
                  </div>
                  {!c.isSystem && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => del.mutate(c.id)}>
                      <Trash2 className="h-4 w-4" />
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
