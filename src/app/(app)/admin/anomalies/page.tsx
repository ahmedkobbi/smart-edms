'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminAnomaliesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-anomalies'],
    queryFn: () => api.get('/api/admin/anomalies'),
    refetchInterval: 30_000,
  });

  const resolve = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.post(`/api/admin/anomalies/${id}/resolve`, { notes }),
    onSuccess: () => {
      toast({ title: t('admin.anomalies.resolvedToast') });
      qc.invalidateQueries({ queryKey: ['admin-anomalies'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.anomalies')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('admin.anomalies.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {t('admin.anomalies.activeTitle')}</CardTitle>
          <CardDescription>Refreshed every 30s; new anomalies are detected on each load</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
              <p className="text-sm font-medium">{t('admin.anomalies.empty')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('admin.anomalies.emptySub')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((a: any) => (
                <div key={a.id} className="p-4 flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                    a.severity === 'critical' ? 'text-red-500' :
                    a.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono text-xs">{a.type}</Badge>
                      <Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">{a.severity}</Badge>
                    </div>
                    <p className="text-sm mt-1">{a.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Detected {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                      {a.actorEmail && ` · actor: ${a.actorEmail}`}
                      {a.actorIp && ` · IP: ${a.actorIp}`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resolve.mutate({ id: a.id })}
                    disabled={resolve.isPending}
                  >
                    {t('admin.anomalies.resolve')}
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
