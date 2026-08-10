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
      toast({ title: res.status === 'cancelled' ? 'Disposition rejected' : 'Disposition executed' });
      qc.invalidateQueries({ queryKey: ['admin-dispositions'] });
      setSelected(null);
      setComment('');
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const viewCert = useMutation({
    mutationFn: (id: string) => api.get(`/api/admin/dispositions/${id}/certificate`),
    onSuccess: (res: any) => setCertificate(res.certificate),
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.dispositions')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve end-of-lifecycle document dispositions. Executed deletes generate a certificate of destruction.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4" /> Disposition records</CardTitle>
          <CardDescription>Includes pending, executed, and cancelled</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No disposition records.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((d) => (
                <div key={d.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{d.document?.title ?? 'Unknown document'}</p>
                      <Badge variant={d.action === 'delete' ? 'destructive' : d.action === 'archive' ? 'secondary' : 'outline'} className="text-xs">{d.action}</Badge>
                      <Badge variant={d.status === 'pending' ? 'default' : d.status === 'executed' ? 'secondary' : 'outline'} className="text-xs">{d.status}</Badge>
                    </div>
                    {d.reason && <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Requested {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
                      {d.executedAt && ` · executed ${formatDistanceToNow(new Date(d.executedAt), { addSuffix: true })}`}
                    </p>
                    {d.certificateHash && (
                      <p className="text-[10px] font-mono text-muted-foreground mt-1">cert:{d.certificateHash.slice(0, 24)}…</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {d.status === 'pending' && (
                      <Button variant="outline" size="sm" onClick={() => setSelected(d)}>
                        Review
                      </Button>
                    )}
                    {d.status === 'executed' && d.certificateHash && (
                      <Button variant="ghost" size="sm" onClick={() => viewCert.mutate(d.id)}>
                        <FileCheck className="mr-1 h-3 w-3" /> Certificate
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
            <DialogTitle>Review disposition</DialogTitle>
            <DialogDescription>
              Approving will {selected?.action === 'delete' ? 'soft-delete the document and issue a certificate of destruction' : selected?.action === 'archive' ? 'mark the document as archived' : 'flag the document for review'}.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-2">
              <div className="text-sm">
                <p className="font-medium">{selected.document?.title}</p>
                <p className="text-xs text-muted-foreground">Action: {selected.action}</p>
                <p className="text-xs text-muted-foreground">Reason: {selected.reason ?? '—'}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="comment">Comment</Label>
                <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Justification for decision…" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => decide.mutate({ id: selected?.id, approved: false })} disabled={decide.isPending}>
              <XCircle className="mr-2 h-3.5 w-3.5" /> Reject
            </Button>
            <Button onClick={() => decide.mutate({ id: selected?.id, approved: true })} disabled={decide.isPending}>
              {decide.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Approve &amp; execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certificate dialog */}
      <Dialog open={!!certificate} onOpenChange={(v) => { if (!v) setCertificate(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Certificate of destruction</DialogTitle>
            <DialogDescription>Cryptographic proof of disposition</DialogDescription>
          </DialogHeader>
          {certificate && (
            <div className="space-y-3 py-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Certificate hash (SHA-256)</p>
                <p className="font-mono text-xs break-all bg-slate-50 dark:bg-slate-900 p-2 rounded">{certificate.hash}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Document</p>
                <p className="font-medium">{certificate.document?.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Action</p>
                <p>{certificate.action}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Issued at</p>
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
