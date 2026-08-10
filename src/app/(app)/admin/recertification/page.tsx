'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { RefreshCw, Loader2, Plus, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminRecertificationPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', reviewerId: '' });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-recertification'],
    queryFn: () => api.get('/api/admin/recertification'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/recertification', form),
    onSuccess: (res: any) => {
      toast({ title: 'Campaign created', description: `${res.userCount} user(s) require review` });
      qc.invalidateQueries({ queryKey: ['admin-recertification'] });
      setCreateOpen(false);
      setForm({ name: '', description: '', reviewerId: '' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.recertification')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Periodic review of user access rights. Required for SOC 2 / ISO 27001 compliance.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> New campaign</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create recertification campaign</DialogTitle>
              <DialogDescription>Generates one review item per active user.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Q4 2025 access review" />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Reviewer user ID *</Label>
                <Input value={form.reviewerId} onChange={(e) => setForm({ ...form, reviewerId: e.target.value })} placeholder="cusr..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || !form.reviewerId || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Campaigns</CardTitle>
          <CardDescription>Each campaign generates per-user review items</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No recertification campaigns yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((c) => (
                <div key={c.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{c.name}</p>
                      <Badge variant={c.status === 'open' ? 'default' : 'secondary'} className="text-xs">{c.status}</Badge>
                      <Badge variant="outline" className="text-xs">{c._count?.items ?? 0} item(s)</Badge>
                    </div>
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      {c.dueAt && ` · due ${formatDistanceToNow(new Date(c.dueAt), { addSuffix: true })}`}
                    </p>
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
