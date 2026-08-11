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
import { Clock, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminRetentionPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', retentionDays: '365',
    startTrigger: 'document.created', dispositionAction: 'review', requireApproval: true, appliesTo: '*',
  });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-retention'],
    queryFn: () => api.get('/api/admin/retention'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/retention', {
      ...form,
      retentionDays: parseInt(form.retentionDays, 10),
    }),
    onSuccess: () => {
      toast({ title: t('admin.retention.createdToast') });
      qc.invalidateQueries({ queryKey: ['admin-retention'] });
      setCreateOpen(false);
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/retention/${id}`),
    onSuccess: () => {
      toast({ title: t('admin.retention.deletedToast') });
      qc.invalidateQueries({ queryKey: ['admin-retention'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.retention')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.retention.subtitle')}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> {t('admin.retention.newButton')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.retention.createTitle')}</DialogTitle>
              <DialogDescription>{t('admin.retention.createDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>{t('admin.retention.nameLabel')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('admin.retention.descriptionLabel')}</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.retention.retentionDaysLabel')}</Label>
                  <Input type="number" min="1" value={form.retentionDays} onChange={(e) => setForm({ ...form, retentionDays: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.retention.startTriggerLabel')}</Label>
                  <Select value={form.startTrigger} onValueChange={(v) => setForm({ ...form, startTrigger: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="document.created">{t('admin.retention.triggerDocCreated')}</SelectItem>
                      <SelectItem value="document.closed">{t('admin.retention.triggerDocClosed')}</SelectItem>
                      <SelectItem value="document.lastModified">{t('admin.retention.triggerLastModified')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.retention.dispositionLabel')}</Label>
                  <Select value={form.dispositionAction} onValueChange={(v) => setForm({ ...form, dispositionAction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="review">{t('admin.retention.dispositionReview')}</SelectItem>
                      <SelectItem value="archive">{t('admin.retention.dispositionArchive')}</SelectItem>
                      <SelectItem value="delete">{t('admin.retention.dispositionDelete')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.retention.appliesToLabel')}</Label>
                  <Input value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })} placeholder={t('admin.retention.appliesToPlaceholder')} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancelButton')}</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('common.createButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> {t('admin.retention.cardTitle')}
          </CardTitle>
          <CardDescription>{t('admin.retention.cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data?.items.map((s) => (
                <div key={s.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{s.name}</p>
                      <Badge variant="secondary" className="text-xs">{t('admin.retention.daysBadge', { count: s.retentionDays })}</Badge>
                      <Badge variant="outline" className="text-xs">{s.dispositionAction}</Badge>
                      {s.requireApproval && <Badge variant="outline" className="text-xs">{t('admin.retention.approvalRequiredBadge')}</Badge>}
                    </div>
                    {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('admin.retention.triggerPrefix')} {s.startTrigger} · {t('admin.retention.appliesToPrefix')} {s.appliesTo} · {t('admin.retention.documentsCount', { count: s._count?.documents ?? 0 })}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => del.mutate(s.id)}>
                    <Trash2 className="h-4 w-4" />
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
