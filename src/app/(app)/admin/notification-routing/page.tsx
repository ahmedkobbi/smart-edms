'use client';

/**
 * Smart EDMS — Notification routing admin page
 *
 * Allows tenant admins to configure how notifications are delivered
 * based on severity + type. Rules are evaluated in priority order;
 * the first match determines the delivery channels.
 *
 * Example rules:
 *   - "Critical security alerts → email all tenant admins"
 *   - "Workflow reminders → in-app only"
 *   - "Policy violations → email + in-app security officers"
 */

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
import { Bell, Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';

const SEVERITY_LEVELS: Record<string, number> = { info: 0, success: 1, warning: 2, critical: 3 };

export default function NotificationRoutingPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    minSeverity: 'warning' as 'info' | 'success' | 'warning' | 'critical',
    typePattern: '*',
    channels: ['in_app'] as string[],
    targetRoles: [] as string[],
    priority: '100',
  });
  const [rolesInput, setRolesInput] = useState('');

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['notification-routing'],
    queryFn: () => api.get('/api/admin/notification-routing'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/notification-routing', {
      ...form,
      priority: parseInt(form.priority, 10),
      targetRoles: rolesInput.split(',').map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      toast({ title: t('admin.notificationRoutingPage.createdToast') });
      qc.invalidateQueries({ queryKey: ['notification-routing'] });
      setCreateOpen(false);
      setForm({ name: '', minSeverity: 'warning', typePattern: '*', channels: ['in_app'], targetRoles: [], priority: '100' });
      setRolesInput('');
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/notification-routing/${id}`),
    onSuccess: () => {
      toast({ title: t('admin.notificationRoutingPage.deletedToast') });
      qc.invalidateQueries({ queryKey: ['notification-routing'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/admin/notification-routing/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-routing'] }),
  });

  const toggleChannel = (channel: string) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6" /> {t('admin.notificationRouting')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.notificationRoutingPage.subtitle')}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> {t('admin.notificationRoutingPage.newRuleButton')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('admin.notificationRoutingPage.createTitle')}</DialogTitle>
              <DialogDescription>
                {t('admin.notificationRoutingPage.createDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>{t('admin.notificationRoutingPage.nameLabel')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('admin.notificationRoutingPage.namePlaceholder')} dir="auto" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.notificationRoutingPage.minSeverityLabel')}</Label>
                  <Select value={form.minSeverity} onValueChange={(v) => setForm({ ...form, minSeverity: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">{t('admin.notificationRoutingPage.infoPlus')}</SelectItem>
                      <SelectItem value="success">{t('admin.notificationRoutingPage.successPlus')}</SelectItem>
                      <SelectItem value="warning">{t('admin.notificationRoutingPage.warningPlus')}</SelectItem>
                      <SelectItem value="critical">{t('admin.notificationRoutingPage.criticalOnly')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.notificationRoutingPage.priorityLabel')}</Label>
                  <Input type="number" min="0" max="1000" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('admin.notificationRoutingPage.typePatternLabel')}</Label>
                <Input value={form.typePattern} onChange={(e) => setForm({ ...form, typePattern: e.target.value })} placeholder={t('admin.notificationRoutingPage.typePatternPlaceholder')} dir="auto" />
                <p className="text-xs text-muted-foreground">{t('admin.notificationRoutingPage.typePatternHint')}</p>
              </div>
              <div className="space-y-1">
                <Label>{t('admin.notificationRoutingPage.channelsLabel')}</Label>
                <div className="flex gap-2">
                  {['in_app', 'email', 'webhook'].map((ch) => (
                    <Button
                      key={ch}
                      type="button"
                      variant={form.channels.includes(ch) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleChannel(ch)}
                    >
                      {ch === 'in_app' ? t('admin.notificationRoutingPage.inApp') : ch === 'email' ? t('admin.notificationRoutingPage.emailChannel') : t('admin.notificationRoutingPage.webhook')}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('admin.notificationRoutingPage.targetRolesLabel')}</Label>
                <Input value={rolesInput} onChange={(e) => setRolesInput(e.target.value)} placeholder={t('admin.notificationRoutingPage.targetRolesPlaceholder')} dir="auto" />
                <p className="text-xs text-muted-foreground">{t('admin.notificationRoutingPage.targetRolesHint')}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancelButton')}</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || form.channels.length === 0 || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('admin.notificationRoutingPage.createRuleButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" /> {t('admin.notificationRoutingPage.cardTitle')}
          </CardTitle>
          <CardDescription>{t('admin.notificationRoutingPage.cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground mb-2">{t('admin.notificationRoutingPage.empty')}</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {t('admin.notificationRoutingPage.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((r) => (
                <div key={r.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{r.name}</p>
                      <Badge variant="secondary" className="text-xs">{t('admin.notificationRoutingPage.priorityBadge', { priority: r.priority })}</Badge>
                      {!r.enabled && <Badge variant="outline" className="text-xs">{t('common.disabledBadge')}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge variant={r.minSeverity === 'critical' ? 'destructive' : r.minSeverity === 'warning' ? 'default' : 'secondary'} className="text-xs">
                        {r.minSeverity}+
                      </Badge>
                      <Badge variant="outline" className="text-xs font-mono">{r.typePattern}</Badge>
                      {r.channels.map((ch: string) => (
                        <Badge key={ch} variant="outline" className="text-xs">{ch}</Badge>
                      ))}
                      {r.targetRoles.length > 0 && (
                        <Badge variant="outline" className="text-xs">→ {r.targetRoles.join(', ')}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}>
                      {r.enabled ? t('common.disableButton') : t('common.enableButton')}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => del.mutate(r.id)}>
                      <Trash2 className="me-1 h-3 w-3" /> {t('common.deleteButton')}
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
