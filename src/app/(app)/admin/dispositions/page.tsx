'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollText, Loader2, CheckCircle2, XCircle, FileCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminDispositionsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [comment, setComment] = useState('');
  const [certificate, setCertificate] = useState<any | null>(null);

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-dispositions'],
    queryFn: () => api.get('/api/admin/dispositions'),
  });

  const decide = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      api.post(`/api/admin/dispositions/${id}/approve`, { approved, comment }),
    onSuccess: (res: any) => {
      toast({ title: res.status === 'cancelled' ? t('admin.dispositions.rejectedToast') : t('admin.dispositions.executedToast') });
      qc.invalidateQueries({ queryKey: ['admin-dispositions'] });
      setSelected(null);
      setComment('');
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const viewCert = useMutation({
    mutationFn: (id: string) => api.get(`/api/admin/dispositions/${id}/certificate`),
    onSuccess: (res: any) => setCertificate(res.certificate),
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.dispositions')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('admin.dispositions.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4" /> {t('admin.dispositions.cardTitle')}</CardTitle>
          <CardDescription>{t('admin.dispositions.cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('admin.dispositions.empty')}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((d) => (
                <div key={d.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{d.document?.title ?? t('admin.dispositions.unknownDocument')}</p>
                      <Badge variant={d.action === 'delete' ? 'destructive' : d.action === 'archive' ? 'secondary' : 'outline'} className="text-xs">{d.action}</Badge>
                      <Badge variant={d.status === 'pending' ? 'default' : d.status === 'executed' ? 'secondary' : 'outline'} className="text-xs">{d.status}</Badge>
                    </div>
                    {d.reason && <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('common.requestedPrefix')} {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
                      {d.executedAt && ` · ${t('common.executedPrefix')} ${formatDistanceToNow(new Date(d.executedAt), { addSuffix: true })}`}
                    </p>
                    {d.certificateHash && (
                      <p className="text-[10px] font-mono text-muted-foreground mt-1">cert:{d.certificateHash.slice(0, 24)}…</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {d.status === 'pending' && (
                      <Button variant="outline" size="sm" onClick={() => setSelected(d)}>
                        {t('admin.dispositions.reviewButton')}
                      </Button>
                    )}
                    {d.status === 'executed' && d.certificateHash && (
                      <Button variant="ghost" size="sm" onClick={() => viewCert.mutate(d.id)}>
                        <FileCheck className="me-1 h-3 w-3" /> {t('admin.dispositions.certificateButton')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) { setSelected(null); setComment(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.dispositions.reviewDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.dispositions.reviewDialogDesc', { action: selected?.action === 'delete' ? t('admin.dispositions.reviewDialogActionDelete') : selected?.action === 'archive' ? t('admin.dispositions.reviewDialogActionArchive') : t('admin.dispositions.reviewDialogActionReview') })}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-2">
              <div className="text-sm">
                <p className="font-medium">{selected.document?.title}</p>
                <p className="text-xs text-muted-foreground">{t('admin.dispositions.actionLabel', { action: selected.action })}</p>
                <p className="text-xs text-muted-foreground">{t('admin.dispositions.reasonLabel', { reason: selected.reason ?? t('admin.dispositions.reasonDash') })}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="comment">{t('admin.dispositions.commentLabel')}</Label>
                <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder={t('admin.dispositions.commentPlaceholder')} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => decide.mutate({ id: selected?.id, approved: false })} disabled={decide.isPending}>
              <XCircle className="me-2 h-3.5 w-3.5" /> {t('common.rejectButton')}
            </Button>
            <Button onClick={() => decide.mutate({ id: selected?.id, approved: true })} disabled={decide.isPending}>
              {decide.isPending && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
              <CheckCircle2 className="me-2 h-3.5 w-3.5" /> {t('admin.dispositions.approveAndExecuteButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certificate dialog */}
      <Dialog open={!!certificate} onOpenChange={(v) => { if (!v) setCertificate(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('admin.dispositions.certDialogTitle')}</DialogTitle>
            <DialogDescription>{t('admin.dispositions.certDialogDesc')}</DialogDescription>
          </DialogHeader>
          {certificate && (
            <div className="space-y-3 py-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('admin.dispositions.certHashLabel')}</p>
                <p className="font-mono text-xs break-all bg-slate-50 dark:bg-slate-900 p-2 rounded">{certificate.hash}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('admin.dispositions.documentLabel')}</p>
                <p className="font-medium">{certificate.document?.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('admin.dispositions.actionLabelPlain')}</p>
                <p>{certificate.action}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('admin.dispositions.issuedAtLabel')}</p>
                <p>{new Date(certificate.issuedAt).toLocaleString()}</p>
              </div>
              <p className="text-xs text-muted-foreground italic">{certificate.note}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
