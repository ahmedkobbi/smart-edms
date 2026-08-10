'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { BookOpen, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export default function AdminVocabulariesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', terms: [''] });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-vocabularies'],
    queryFn: () => api.get('/api/admin/vocabularies'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/vocabularies', { ...form, terms: form.terms.filter((t) => t.trim()) }),
    onSuccess: () => {
      toast({ title: 'Vocabulary created' });
      qc.invalidateQueries({ queryKey: ['admin-vocabularies'] });
      setCreateOpen(false);
      setForm({ name: '', description: '', terms: [''] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/vocabularies/${id}`),
    onSuccess: () => {
      toast({ title: 'Vocabulary deleted' });
      qc.invalidateQueries({ queryKey: ['admin-vocabularies'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Controlled vocabularies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable term lists for metadata field validation.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New vocabulary</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create vocabulary</DialogTitle>
              <DialogDescription>Define a list of allowed terms for metadata fields.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="departments" />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Terms (one per line)</Label>
                <div className="space-y-1">
                  {form.terms.map((t, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={t}
                        onChange={(e) => setForm({ ...form, terms: form.terms.map((x, idx) => idx === i ? e.target.value : x) })}
                        placeholder={`Term ${i + 1}`}
                      />
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setForm({ ...form, terms: form.terms.filter((_, idx) => idx !== i) })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => setForm({ ...form, terms: [...form.terms, ''] })}>
                  <Plus className="mr-1 h-3 w-3" /> Add term
                </Button>
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
          <CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4" /> Vocabularies</CardTitle>
          <CardDescription>Used by metadata schemas for select/multiselect fields</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No vocabularies defined.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((v) => (
                <div key={v.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{v.name}</p>
                      <Badge variant="secondary" className="text-xs">{v.terms?.length ?? 0} term(s)</Badge>
                    </div>
                    {v.description && <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(v.terms || []).slice(0, 10).map((t: string) => (
                        <Badge key={t} variant="outline" className="text-[10px] py-0">{t}</Badge>
                      ))}
                      {(v.terms || []).length > 10 && <Badge variant="outline" className="text-[10px] py-0">+{v.terms.length - 10} more</Badge>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => del.mutate(v.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> Delete
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
