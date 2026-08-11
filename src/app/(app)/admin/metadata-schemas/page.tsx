'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Database, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminMetadataSchemasPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    appliesTo: '*',
    fields: [{ name: '', label: '', type: 'text', required: false }],
  });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-metadata-schemas'],
    queryFn: () => api.get('/api/admin/metadata-schemas'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/metadata-schemas', form),
    onSuccess: () => {
      toast({ title: t('admin.metadataSchemas.createdToast') });
      qc.invalidateQueries({ queryKey: ['admin-metadata-schemas'] });
      setCreateOpen(false);
      setForm({ name: '', description: '', appliesTo: '*', fields: [{ name: '', label: '', type: 'text', required: false }] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/metadata-schemas/${id}`),
    onSuccess: () => {
      toast({ title: t('admin.metadataSchemas.deletedToast') });
      qc.invalidateQueries({ queryKey: ['admin-metadata-schemas'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.metadataSchemas')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.metadataSchemas.subtitle')}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> {t('admin.metadataSchemas.newButton')}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('admin.metadataSchemas.createTitle')}</DialogTitle>
              <DialogDescription>{t('admin.metadataSchemas.createDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.metadataSchemas.nameLabel')}</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.metadataSchemas.appliesToLabel')}</Label>
                  <Input value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })} placeholder={t('admin.metadataSchemas.appliesToPlaceholder')} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('admin.metadataSchemas.descriptionLabel')}</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.metadataSchemas.fieldsLabel')}</Label>
                {form.fields.map((f, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input className="col-span-3" placeholder={t('admin.metadataSchemas.fieldNamePlaceholder')} value={f.name} onChange={(e) => updateField(form, setForm, i, 'name', e.target.value)} />
                    <Input className="col-span-3" placeholder={t('admin.metadataSchemas.fieldLabelPlaceholder')} value={f.label} onChange={(e) => updateField(form, setForm, i, 'label', e.target.value)} />
                    <select className="col-span-3 h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.type} onChange={(e) => updateField(form, setForm, i, 'type', e.target.value)}>
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="date">date</option>
                      <option value="boolean">boolean</option>
                      <option value="select">select</option>
                    </select>
                    <label className="col-span-2 flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={f.required} onChange={(e) => updateField(form, setForm, i, 'required', e.target.checked)} />
                      {t('admin.metadataSchemas.requiredLabel')}
                    </label>
                    <Button variant="ghost" size="sm" className="col-span-1 h-8 px-0 text-red-600" onClick={() => setForm({ ...form, fields: form.fields.filter((_, idx) => idx !== i) })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setForm({ ...form, fields: [...form.fields, { name: '', label: '', type: 'text', required: false }] })}>
                  <Plus className="me-1 h-3 w-3" /> {t('admin.metadataSchemas.addFieldButton')}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancelButton')}</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || form.fields.some((f) => !f.name) || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('common.createButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" /> {t('admin.metadataSchemas.cardTitle')}</CardTitle>
          <CardDescription>{t('admin.metadataSchemas.cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('admin.metadataSchemas.empty')}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((s) => (
                <div key={s.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{s.name}</p>
                      <Badge variant="secondary" className="text-xs">{t('admin.metadataSchemas.fieldsCount', { count: s.fields?.length ?? 0 })}</Badge>
                      <Badge variant="outline" className="text-xs font-mono">{t('admin.metadataSchemas.appliesToBadge', { value: s.appliesTo })}</Badge>
                    </div>
                    {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.fields?.map((f: any) => (
                        <Badge key={f.name} variant="outline" className="font-mono text-[10px] py-0">
                          {f.name}:{f.type}{f.required ? '*' : ''}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => del.mutate(s.id)}>
                    <Trash2 className="me-1 h-3 w-3" /> {t('common.deleteButton')}
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

function updateField(form: any, setForm: any, i: number, key: string, value: any) {
  const fields = [...form.fields];
  fields[i] = { ...fields[i], [key]: value };
  setForm({ ...form, fields });
}
