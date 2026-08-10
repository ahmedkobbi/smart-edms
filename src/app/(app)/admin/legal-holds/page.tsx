'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { FileLock, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminLegalHoldsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', reason: '', caseRef: '' });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-legal-holds'],
    queryFn: () => api.get('/api/admin/legal-holds'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/legal-holds', { ...form, documentIds: [] }),
    onSuccess: () => {
      toast({ title: 'Legal hold created' });
      qc.invalidateQueries({ queryKey: ['admin-legal-holds'] });
      setCreateOpen(false);
      setForm({ name: '', reason: '', caseRef: '' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const release = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/legal-holds/${id}?reason=Released%20by%20admin`),
    onSuccess: () => {
      toast({ title: 'Legal hold released' });
      qc.invalidateQueries({ queryKey: ['admin-legal-holds'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.legalHolds')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Active legal holds override retention disposition. Releases are audit-logged.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New hold</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create legal hold</DialogTitle>
              <DialogDescription>You can attach documents after creation.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Reason *</Label>
                <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} />
              </div>
              <div className="space-y-1">
                <Label>Case reference</Label>
                <Input value={form.caseRef} onChange={(e) => setForm({ ...form, caseRef: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || !form.reason || create.isPending}>
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
            <FileLock className="h-4 w-4" /> Active holds
          </CardTitle>
          <CardDescription>Released holds are excluded from this view.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No active legal holds.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((h) => (
                <div key={h.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{h.name}</p>
                      {h.caseRef && <Badge variant="outline" className="text-xs">{h.caseRef}</Badge>}
                      <Badge variant="secondary" className="text-xs">{h._count?.documents ?? 0} doc(s)</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{h.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      Set {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => release.mutate(h.id)}
                  >
                    Release
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
