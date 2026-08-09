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
        toast({ title: 'Chain intact', description: `${res.verifiedCount} events verified` });
      } else {
        toast({ title: 'Chain broken!', description: `At sequence #${res.brokenAt?.sequenceNum}`, variant: 'destructive' });
      }
    },
    onError: (err: any) => toast({ title: 'Verify failed', description: err?.message, variant: 'destructive' }),
  });

  const exportCsv = useMutation({
    mutationFn: () => api.get('/api/audit/export'),
    onSuccess: () => {
      // Browser will download via direct link
    },
    onError: (err: any) => toast({ title: 'Export failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tamper-evident, hash-chained record of every sensitive action.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => verify.mutate()} disabled={verify.isPending}>
            {verify.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-2 h-3.5 w-3.5" />}
            Verify integrity
          </Button>
          <a href="/api/audit/export">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
            </Button>
          </a>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Search by event, actor, resource…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="flex-1"
            />
            <Select value={result} onValueChange={(v) => { setResult(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4" /> Events
          </CardTitle>
          <CardDescription>
            {data?.total ?? 0} total · showing page {data?.page ?? 1}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No events match your filters.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => setSelected(ev)}
                  className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                      ev.result === 'allow' ? 'bg-emerald-500' : ev.result === 'deny' ? 'bg-red-500' : 'bg-amber-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs">{ev.eventType}</span>
                        <Badge variant="outline" className="text-[10px] py-0">{ev.result}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ev.actorEmail ?? 'system'}
                        {ev.resourceName && ` · ${ev.resourceName}`}
                        {ev.reason && ` · ${ev.reason}`}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>#{ev.sequenceNum}</p>
                      <p>{formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.total > 50 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {/* Event detail dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{selected?.eventType}</DialogTitle>
            <DialogDescription>Sequence #{selected?.sequenceNum}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1">
            {selected && (
              <div className="space-y-3 text-sm">
                <Field label="Result" value={selected.result} />
                <Field label="Actor" value={selected.actorEmail ?? 'system'} />
                <Field label="Actor IP" value={selected.actorIp ?? '—'} />
                <Field label="Action" value={selected.action} />
                <Field label="Resource type" value={selected.resourceType ?? '—'} />
                <Field label="Resource ID" value={selected.resourceId ?? '—'} />
                <Field label="Resource name" value={selected.resourceName ?? '—'} />
                <Field label="Reason" value={selected.reason ?? '—'} />
                <Field label="Created at" value={new Date(selected.createdAt).toISOString()} />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Metadata</p>
                  <pre className="text-xs bg-slate-50 dark:bg-slate-900 p-3 rounded-md overflow-x-auto">
                    {JSON.stringify(JSON.parse(selected.metadata || '{}'), null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Previous hash</p>
                  <p className="font-mono text-xs break-all bg-slate-50 dark:bg-slate-900 p-2 rounded">{selected.prevHash}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Event hash</p>
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
            <DialogTitle>Audit chain verification</DialogTitle>
            <DialogDescription>Recomputes SHA-256 hashes across the entire tenant chain.</DialogDescription>
          </DialogHeader>
          {verify.data && (
            <div className="space-y-3">
              {verify.data.ok ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="font-medium">Chain intact</p>
                    <p className="text-xs text-muted-foreground">{verify.data.verifiedCount} events verified</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-md">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="font-medium">Chain broken at #{verify.data.brokenAt?.sequenceNum}</p>
                    <p className="text-xs text-muted-foreground">
                      Expected: {truncateHash(verify.data.brokenAt?.expectedHash ?? '', 16, 12)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Actual: {truncateHash(verify.data.brokenAt?.actualHash ?? '', 16, 12)}
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
