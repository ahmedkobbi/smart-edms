'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { BookMarked, Loader2, Plus, Trash2, Languages } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';
import { LocalizationEditor } from './localization-editor';

export default function AdminClassificationsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '', level: '1', color: '#2563eb' });
  const [localizeTarget, setLocalizeTarget] = useState<any | null>(null);

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
      toast({ title: t('admin.classifications.createdToast') });
      qc.invalidateQueries({ queryKey: ['admin-classifications'] });
      qc.invalidateQueries({ queryKey: ['classifications'] });
      setCreateOpen(false);
      setForm({ code: '', name: '', description: '', level: '1', color: '#2563eb' });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/classifications/${id}`),
    onSuccess: () => {
      toast({ title: t('admin.classifications.deletedToast') });
      qc.invalidateQueries({ queryKey: ['admin-classifications'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.classifications')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.classifications.subtitle')}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> {t('admin.classifications.newButton')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.classifications.createTitle')}</DialogTitle>
              <DialogDescription>{t('admin.classifications.createDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.classifications.codeLabel')}</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder={t('admin.classifications.codePlaceholder')} maxLength={32} />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.classifications.levelLabel')}</Label>
                  <Input type="number" min="0" max="99" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('admin.classifications.nameLabel')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('admin.classifications.descriptionLabel')}</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('admin.classifications.colorLabel')}</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-16 h-10 p-1" />
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1 font-mono" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancelButton')}</Button>
              <Button onClick={() => create.mutate()} disabled={!form.code || !form.name || create.isPending}>
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
            <BookMarked className="h-4 w-4" /> {t('admin.classifications.cardTitle')}
          </CardTitle>
          <CardDescription>{t('admin.classifications.cardDesc')}</CardDescription>
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
                      <Badge variant="secondary" className="text-xs">{t('admin.classifications.levelBadge', { level: c.level })}</Badge>
                      {c.isSystem && <Badge variant="outline" className="text-xs">{t('common.systemBadge')}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.description ?? t('admin.classifications.noDescription')}</p>
                    <p className="text-xs text-muted-foreground">{t('admin.classifications.documentsCount', { count: c._count?.documents ?? 0 })}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setLocalizeTarget(c)}
                      title={t('admin.classifications.localizeTitleAttr')}
                    >
                      <Languages className="h-4 w-4" />
                      <span className="hidden sm:inline ms-1">{t('admin.classifications.localizeButton')}</span>
                    </Button>
                    {!c.isSystem && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => del.mutate(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Localization editor dialog */}
      <LocalizationEditor
        open={!!localizeTarget}
        onOpenChange={(o) => !o && setLocalizeTarget(null)}
        classification={localizeTarget}
      />
    </div>
  );
}
