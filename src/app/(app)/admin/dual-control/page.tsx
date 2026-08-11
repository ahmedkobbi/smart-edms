'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function DualControlPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['dual-control'],
    queryFn: () => api.get('/api/admin/dual-control?status=all'),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      api.post(`/api/admin/dual-control/${id}`, { decision }),
    onSuccess: (_, vars) => {
      toast({ title: vars.decision === 'approve' ? t('admin.dualControlPage.approvedToast') : t('admin.dualControlPage.rejectedToast') });
      qc.invalidateQueries({ queryKey: ['dual-control'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> {t('admin.dualControl')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('admin.dualControlPage.subtitle')}
        </p>
      </div>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base">{t('admin.dualControlPage.requestsTitle')}</CardTitle>
          <CardDescription>{t('admin.dualControlPage.requestsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('admin.dualControlPage.empty')}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((r: any) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Badge variant={r.status === 'pending' ? 'default' : r.status === 'approved' ? 'secondary' : 'destructive'} className="text-xs capitalize">
                      {r.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-mono">{r.action}</Badge>
                    <Badge variant="outline" className="text-xs">{r.resourceType}:{r.resourceId}</Badge>
                  </div>
                  <p className="text-sm">{r.reason}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('common.requestedPrefix')} {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                  {r.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: r.id, decision: 'approve' })} disabled={decide.isPending}>
                        <CheckCircle2 className="me-1 h-3 w-3" /> {t('admin.dualControlPage.approveButton')}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => decide.mutate({ id: r.id, decision: 'reject' })} disabled={decide.isPending}>
                        <XCircle className="me-1 h-3 w-3" /> {t('admin.dualControlPage.rejectButton')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
