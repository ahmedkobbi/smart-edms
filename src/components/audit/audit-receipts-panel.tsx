'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileSignature, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export function AuditReceiptsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['audit-receipts'],
    queryFn: () => api.get('/api/admin/audit-receipts'),
  });

  const generate = useMutation({
    mutationFn: () => api.post('/api/admin/audit-receipts'),
    onSuccess: (res: any) => {
      toast({
        title: 'Receipt generated',
        description: `${res.receipt.eventCount} events covered`,
      });
      qc.invalidateQueries({ queryKey: ['audit-receipts'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4" /> Signed audit receipts
          </CardTitle>
          <CardDescription>Periodic integrity snapshots with HMAC signature</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="me-2 h-3.5 w-3.5" />}
          Generate (last 24h)
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : !data?.items?.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No receipts yet. Generate one to capture a signed snapshot of the last 24h.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-900 max-h-80 overflow-y-auto">
            {data.items.map((r) => (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <FileSignature className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{r.eventCount} events</Badge>
                    <Badge variant="secondary" className="text-xs font-mono">#{r.lastSequenceNum}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(r.periodStart).toLocaleString()} → {new Date(r.periodEnd).toLocaleString()}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1 break-all">
                    receipt: {r.receiptHash.slice(0, 32)}…
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground break-all">
                    sig: {r.signature.slice(0, 32)}…
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Generated {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
