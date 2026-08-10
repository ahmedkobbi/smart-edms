'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, ShieldAlert, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function BreakGlassPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [justification, setJustification] = useState('');
  const [result, setResult] = useState<any | null>(null);

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['break-glass'],
    queryFn: () => api.get('/api/admin/break-glass'),
  });

  const request = useMutation({
    mutationFn: () => api.post('/api/admin/break-glass', { reason, justification }),
    onSuccess: (res: any) => {
      toast({
        title: t('admin.breakGlass.grantedToastTitle'),
        description: t('admin.breakGlass.grantedToastDesc'),
        variant: 'destructive',
      });
      setResult(res);
      qc.invalidateQueries({ queryKey: ['break-glass'] });
      setReason('');
      setJustification('');
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-red-500" /> {t('admin.breakGlass.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('admin.breakGlass.subtitle')}
        </p>
      </div>

      <Card className="glass-card border-red-200 dark:border-red-900">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-amber-700 dark:text-amber-400">{t('admin.breakGlass.warningTitle')}</p>
              <p className="text-muted-foreground">
                {t('admin.breakGlass.warningBody')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!result ? (
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-base">{t('admin.breakGlass.requestTitle')}</CardTitle>
            <CardDescription>{t('admin.breakGlass.requestDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="reason">{t('admin.breakGlass.reasonLabel')}</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('admin.breakGlass.reasonPlaceholder')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="justification">{t('admin.breakGlass.justificationLabel')}</Label>
              <Textarea id="justification" value={justification} onChange={(e) => setJustification(e.target.value)} rows={4} placeholder={t('admin.breakGlass.justificationPlaceholder')} />
            </div>
            <Button
              variant="destructive"
              onClick={() => request.mutate()}
              disabled={reason.length < 10 || justification.length < 20 || request.isPending}
            >
              {request.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="me-2 h-4 w-4" />}
              {t('admin.breakGlass.requestButton')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card border-red-300 dark:border-red-800">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              <p className="font-semibold text-red-600 dark:text-red-400">{t('admin.breakGlass.activeTitle')}</p>
            </div>
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">{t('admin.breakGlass.expiresLabel')}</span> {new Date(result.breakGlass.expiresAt).toLocaleString()}</p>
              <p><span className="text-muted-foreground">{t('admin.breakGlass.tokenLabel')}</span> <code className="text-xs break-all">{result.token}</code></p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                {t('admin.breakGlass.tokenWarning')}
              </p>
            </div>
            <Button variant="outline" onClick={() => setResult(null)}>{t('common.dismiss')}</Button>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base">{t('admin.breakGlass.historyTitle')}</CardTitle>
          <CardDescription>{t('admin.breakGlass.historyDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('admin.breakGlass.historyEmpty')}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((bg: any) => (
                <div key={bg.id} className="p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={bg.reviewed ? 'secondary' : 'destructive'} className="text-xs">
                      {bg.reviewed ? t('admin.breakGlass.reviewed') : t('admin.breakGlass.pendingReview')}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="me-1 h-3 w-3" />
                      {formatDistanceToNow(new Date(bg.grantedAt), { addSuffix: true })}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{bg.reason}</p>
                  <p className="text-xs text-muted-foreground mt-1">{bg.justification}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin.breakGlass.expiresLabel')} {new Date(bg.expiresAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
