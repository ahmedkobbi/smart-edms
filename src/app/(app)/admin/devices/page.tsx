'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminDevicesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-devices'],
    queryFn: () => api.get('/api/admin/devices'),
  });

  const toggleTrust = useMutation({
    mutationFn: ({ id, trusted }: { id: string; trusted: boolean }) =>
      api.patch(`/api/admin/devices/${id}`, { trusted }),
    onSuccess: () => {
      toast({ title: t('admin.devices.updatedToast') });
      qc.invalidateQueries({ queryKey: ['admin-devices'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/devices/${id}`),
    onSuccess: () => {
      toast({ title: t('admin.devices.revokedToast') });
      qc.invalidateQueries({ queryKey: ['admin-devices'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.devices')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('admin.devices.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" /> {t('admin.devices.cardTitle')}</CardTitle>
          <CardDescription>{t('admin.devices.cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('admin.devices.empty')}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((d) => (
                <div key={d.id} className="p-4 flex items-start gap-3">
                  {d.trusted ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{d.label}</p>
                      {d.trusted ? <Badge variant="default" className="text-xs">{t('admin.devices.trustedBadge')}</Badge> : <Badge variant="secondary" className="text-xs">{t('admin.devices.untrustedBadge')}</Badge>}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{d.fingerprint.slice(0, 24)}…</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('common.lastSeenPrefix')} {formatDistanceToNow(new Date(d.lastSeenAt), { addSuffix: true })}
                      {d.lastSeenIp && ` · ${t('common.ipLabel')} ${d.lastSeenIp}`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleTrust.mutate({ id: d.id, trusted: !d.trusted })}>
                      {d.trusted ? t('admin.devices.untrustButton') : t('admin.devices.trustButton')}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => revoke.mutate(d.id)}>
                      {t('common.revokeButton')}
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
