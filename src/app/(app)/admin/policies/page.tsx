'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { ShieldCheck, Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';

// Condition presets — common ABAC rules admins can apply with one click
const CONDITION_PRESETS: { label: string; description: string; conditions: Record<string, unknown> }[] = [
  {
    label: 'admin.policies.presetRestrictClassification',
    description: 'admin.policies.presetRestrictClassificationDesc',
    conditions: { classification: ['RESTRICTED', 'HS'] },
  },
  {
    label: 'admin.policies.presetRestrictTag',
    description: 'admin.policies.presetRestrictTagDesc',
    conditions: { hasTag: 'confidential' },
  },
  {
    label: 'admin.policies.presetBusinessHours',
    description: 'admin.policies.presetBusinessHoursDesc',
    conditions: { timeOfDay: { start: '09:00', end: '17:00' }, dayOfWeek: [1, 2, 3, 4, 5] },
  },
  {
    label: 'admin.policies.presetInternalNetwork',
    description: 'admin.policies.presetInternalNetworkDesc',
    conditions: { ipRange: ['10.0.0.0/8', '192.168.0.0/16', '172.16.0.0/12'] },
  },
  {
    label: 'admin.policies.presetOwnerOnly',
    description: 'admin.policies.presetOwnerOnlyDesc',
    conditions: { ownerOnly: true },
  },
  {
    label: 'admin.policies.presetRecordsOnly',
    description: 'admin.policies.presetRecordsOnlyDesc',
    conditions: { isRecord: true },
  },
  {
    label: 'admin.policies.presetLegalHold',
    description: 'admin.policies.presetLegalHoldDesc',
    conditions: { legalHold: true },
  },
];

export default function AdminPoliciesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', effect: 'deny', action: '', resource: '', priority: '100',
  });
  const [conditionsJson, setConditionsJson] = useState('{}');
  const [conditionsError, setConditionsError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-policies'],
    queryFn: () => api.get('/api/admin/policies'),
  });

  const create = useMutation({
    mutationFn: () => {
      let conditions: Record<string, unknown> = {};
      try {
        conditions = JSON.parse(conditionsJson);
        setConditionsError(null);
      } catch (err) {
        setConditionsError(t('admin.policies.invalidJsonPrefix') + ' ' + (err as Error).message);
        throw new Error(t('admin.policies.invalidConditionsJson'));
      }
      return api.post('/api/admin/policies', {
        ...form,
        priority: parseInt(form.priority, 10),
        conditions,
      });
    },
    onSuccess: () => {
      toast({ title: t('admin.policies.createdToast') });
      qc.invalidateQueries({ queryKey: ['admin-policies'] });
      setCreateOpen(false);
      setForm({ name: '', description: '', effect: 'deny', action: '', resource: '', priority: '100' });
      setConditionsJson('{}');
      setConditionsError(null);
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/policies/${id}`),
    onSuccess: () => {
      toast({ title: t('admin.policies.deletedToast') });
      qc.invalidateQueries({ queryKey: ['admin-policies'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/admin/policies/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-policies'] }),
  });

  const applyPreset = (preset: typeof CONDITION_PRESETS[0]) => {
    setConditionsJson(JSON.stringify(preset.conditions, null, 2));
    setConditionsError(null);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.policies')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.policies.subtitle')}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (o) { setConditionsJson('{}'); setConditionsError(null); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> {t('admin.policies.newButton')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('admin.policies.createTitle')}</DialogTitle>
              <DialogDescription>
                {t('admin.policies.createDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>{t('admin.policies.nameLabel')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('admin.policies.namePlaceholder')} dir="auto" />
              </div>
              <div className="space-y-1">
                <Label>{t('admin.policies.descriptionLabel')}</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('admin.policies.descriptionPlaceholder')} dir="auto" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.policies.effectLabel')}</Label>
                  <Select value={form.effect} onValueChange={(v) => setForm({ ...form, effect: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">{t('admin.policies.effectAllow')}</SelectItem>
                      <SelectItem value="deny">{t('admin.policies.effectDeny')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.policies.priorityLabel')}</Label>
                  <Input type="number" min="0" max="1000" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('admin.policies.actionLabel')}</Label>
                <Input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} placeholder={t('admin.policies.actionPlaceholder')} dir="auto" />
                <p className="text-xs text-muted-foreground">
                  {t('admin.policies.actionHint')}
                </p>
              </div>
              <div className="space-y-1">
                <Label>{t('admin.policies.resourceLabel')}</Label>
                <Input value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value })} placeholder={t('admin.policies.resourcePlaceholder')} dir="auto" />
                <p className="text-xs text-muted-foreground">
                  {t('admin.policies.resourceHint')}
                </p>
              </div>

              {/* Conditions editor */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label>{t('admin.policies.conditionsLabel')}</Label>
                  <span className="text-xs text-muted-foreground">{t('admin.policies.conditionsHint')}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {CONDITION_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => applyPreset(preset)}
                      title={t(preset.description)}
                    >
                      {t(preset.label)}
                    </Button>
                  ))}
                </div>
                <Textarea
                  value={conditionsJson}
                  onChange={(e) => { setConditionsJson(e.target.value); setConditionsError(null); }}
                  rows={6}
                  className="font-mono text-xs"
                  placeholder='{"classification": ["RESTRICTED", "HS"], "timeOfDay": {"start": "09:00", "end": "17:00"}}'
                  dir="ltr"
                />
                {conditionsError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {conditionsError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('admin.policies.conditionsSupported')}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancelButton')}</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || !form.action || !form.resource || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('admin.policies.createPolicyButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> {t('admin.policies.cardTitle')}
          </CardTitle>
          <CardDescription>
            {t('admin.policies.cardDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">{t('admin.policies.empty')}</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {t('admin.policies.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((p) => {
                const conditions = typeof p.conditions === 'string' ? JSON.parse(p.conditions || '{}') : p.conditions;
                const conditionKeys = Object.keys(conditions || {});
                return (
                  <div key={p.id} className="p-4 flex items-start gap-3">
                    <Badge variant={p.effect === 'deny' ? 'destructive' : 'default'} className="mt-0.5">{p.effect}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{p.name}</p>
                        <Badge variant="secondary" className="text-xs">{t('admin.policies.priorityBadge', { priority: p.priority })}</Badge>
                        {!p.enabled && <Badge variant="outline" className="text-xs">{t('common.disabledBadge')}</Badge>}
                      </div>
                      {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                      <p className="text-xs font-mono mt-1">
                        <span className="text-muted-foreground">{t('admin.policies.actionPrefix')}</span> {p.action}{' '}
                        <span className="text-muted-foreground">{t('admin.policies.resourcePrefix')}</span> {p.resource}
                      </p>
                      {conditionKeys.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {conditionKeys.map((k) => (
                            <Badge key={k} variant="outline" className="text-[10px] font-mono py-0">
                              {k}: {JSON.stringify(conditions[k])}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toggle.mutate({ id: p.id, enabled: !p.enabled })}
                      >
                        {p.enabled ? t('common.disableButton') : t('common.enableButton')}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => del.mutate(p.id)}>
                        <Trash2 className="me-1 h-3 w-3" /> {t('common.deleteButton')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
