'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollText, Download, ShieldCheck, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { truncateHash } from '@/lib/utils/format';
import { AuditReceiptsPanel } from '@/components/audit/audit-receipts-panel';
import { AuditTimeline } from '@/components/audit/audit-timeline';
import { useI18n } from '@/i18n/use-i18n';

interface AuditItem {
  id: string;
  sequenceNum: number;
  eventType: string;
  actorId: string | null;
  actorEmail: string | null;
  actorIp: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  resourceName: string | null;
  result: 'allow' | 'deny' | 'error';
  reason: string | null;
  metadata: string;
  prevHash: string;
  eventHash: string;
  createdAt: string;
}

interface VerifyResult {
  ok: boolean;
  verifiedCount: number;
  brokenAt?: { sequenceNum: number; expectedHash: string; actualHash: string };
}

export default function AuditPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<string>('all');
  const [selected, setSelected] = useState<AuditItem | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (result !== 'all') p.set('result', result);
    p.set('page', String(page));
    p.set('pageSize', '50');
    return p.toString();
  }, [search, result, page]);

  const { data, isLoading } = useQuery<{ items: AuditItem[]; total: number; page: number; pageSize: number }>({
    queryKey: ['audit', params],
    queryFn: () => api.get(`/api/audit?${params}`),
  });

  const verify = useMutation({
    mutationFn: () => api.get<VerifyResult>('/api/audit/verify'),
    onSuccess: (res) => {
      setVerifyOpen(true);
      if (res.ok) {
        toast({ title: t('audit.chainIntact'), description: t('audit.eventsVerifiedCount', { count: res.verifiedCount }) });
      } else {
        toast({ title: t('audit.chainBroken'), description: t('audit.brokenAtSequence', { sequence: res.brokenAt?.sequenceNum }), variant: 'destructive' });
      }
    },
    onError: (err: any) => toast({ title: t('audit.verifyFailedToast'), description: err?.message, variant: 'destructive' }),
  });

  const exportCsv = useMutation({
    mutationFn: () => api.get('/api/audit/export'),
    onSuccess: () => {
      // Browser will download via direct link
    },
    onError: (err: any) => toast({ title: t('audit.exportFailedToast'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('audit.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('audit.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => verify.mutate()} disabled={verify.isPending}>
            {verify.isPending ? <Loader2 className="ms-2 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="ms-2 h-3.5 w-3.5" />}
            {t('audit.verifyIntegrity')}
          </Button>
          <a href="/api/audit/export">
            <Button variant="outline" size="sm">
              <Download className="ms-2 h-3.5 w-3.5" /> {t('audit.exportCsv')}
            </Button>
          </a>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              placeholder={t('audit.searchEvents')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="flex-1"
            />
            <Select value={result} onValueChange={(v) => { setResult(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('audit.resultFilterAll')}</SelectItem>
                <SelectItem value="allow">{t('audit.resultFilterAllow')}</SelectItem>
                <SelectItem value="deny">{t('audit.resultFilterDeny')}</SelectItem>
                <SelectItem value="error">{t('audit.resultFilterError')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4" /> {t('audit.events')}
          </CardTitle>
          <CardDescription>
            {t('audit.eventsPageSummary', { total: data?.total ?? 0, page: data?.page ?? 1 })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('audit.noEvents')}</p>
          ) : (
            <div className="p-4 max-h-[600px] overflow-y-auto scrollbar-premium">
              <AuditTimeline events={data.items} />
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.total > 50 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('common.previous')}</Button>
          <Button variant="outline" size="sm" disabled={page * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>{t('common.next')}</Button>
        </div>
      )}

      <AuditReceiptsPanel />

      {/* Event detail dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{selected?.eventType}</DialogTitle>
            <DialogDescription>{t('audit.sequence')} #{selected?.sequenceNum}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1">
            {selected && (
              <div className="space-y-3 text-sm">
                <Field label={t('audit.result')} value={selected.result} />
                <Field label={t('audit.actor')} value={selected.actorEmail ?? t('audit.systemActor')} />
                <Field label={t('audit.actorIp')} value={selected.actorIp ?? '—'} />
                <Field label={t('audit.action')} value={selected.action} />
                <Field label={t('audit.resourceType')} value={selected.resourceType ?? '—'} />
                <Field label={t('audit.resourceId')} value={selected.resourceId ?? '—'} />
                <Field label={t('audit.resource')} value={selected.resourceName ?? '—'} />
                <Field label={t('audit.reason')} value={selected.reason ?? '—'} />
                <Field label={t('common.createdAt')} value={new Date(selected.createdAt).toISOString()} />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t('audit.metadata')}</p>
                  <pre className="text-xs bg-slate-50 dark:bg-slate-900 p-3 rounded-md overflow-x-auto">
                    {JSON.stringify(JSON.parse(selected.metadata || '{}'), null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t('audit.previousHash')}</p>
                  <p className="font-mono text-xs break-all bg-slate-50 dark:bg-slate-900 p-2 rounded">{selected.prevHash}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t('audit.eventHash')}</p>
                  <p className="font-mono text-xs break-all bg-slate-50 dark:bg-slate-900 p-2 rounded">{selected.eventHash}</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Verify result dialog */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('audit.verificationDialogTitle')}</DialogTitle>
            <DialogDescription>{t('audit.verificationDialogDesc')}</DialogDescription>
          </DialogHeader>
          {verify.data && (
            <div className="space-y-3">
              {verify.data.ok ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="font-medium">{t('audit.chainIntact')}</p>
                    <p className="text-xs text-muted-foreground">{t('audit.eventsVerifiedCount', { count: verify.data.verifiedCount })}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-md">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="font-medium">{t('audit.chainBrokenAt', { sequence: verify.data.brokenAt?.sequenceNum })}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('audit.expectedLabel')} {truncateHash(verify.data.brokenAt?.expectedHash ?? '', 16, 12)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('audit.actualLabel')} {truncateHash(verify.data.brokenAt?.actualHash ?? '', 16, 12)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
