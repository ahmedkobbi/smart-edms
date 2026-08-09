'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Webhook, Loader2, Plus, Trash2, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

const COMMON_EVENTS = [
  'document.created', 'document.updated', 'document.deleted', 'document.downloaded',
  'share.created', 'share.viewed', 'share.revoked',
  'workflow.created', 'workflow.approved', 'workflow.rejected',
  'classification.changed', 'legalhold.created', 'legalhold.released',
  'audit.anomaly', 'user.created', 'user.suspended',
];

export default function AdminWebhooksPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', url: '', events: [] as string[], enabled: true });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-webhooks'],
    queryFn: () => api.get('/api/admin/webhooks'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/webhooks', { ...form, generateSecret: true }),
    onSuccess: (res: any) => {
      setCreatedSecret(res.secret);
      qc.invalidateQueries({ queryKey: ['admin-webhooks'] });
      setForm({ name: '', url: '', events: [], enabled: true });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/webhooks/${id}`),
    onSuccess: () => {
      toast({ title: 'Webhook deleted' });
      qc.invalidateQueries({ queryKey: ['admin-webhooks'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Outgoing HTTP notifications for system events. HMAC-signed with a shared secret.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setCreatedSecret(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New webhook</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdSecret ? 'Webhook created' : 'Create webhook'}</DialogTitle>
              <DialogDescription>
                {createdSecret ? 'Save this signing secret. It will not be shown again.' : 'Configure a new outgoing webhook.'}
              </DialogDescription>
            </DialogHeader>
            {createdSecret ? (
              <div className="space-y-3 py-2">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
                  <p className="font-mono text-xs break-all">{createdSecret}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  The X-Smart-EDMS-Signature header is computed as SHA256(payload + secret).
                  Verify this signature on receipt.
                </p>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(createdSecret); toast({ title: 'Copied' }); }}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                </Button>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>URL *</Label>
                  <Input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/webhook" />
                </div>
                <div className="space-y-1">
                  <Label>Events</Label>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md p-2 space-y-1">
                    {COMMON_EVENTS.map((ev) => (
                      <label key={ev} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={form.events.includes(ev)}
                          onChange={(e) => {
                            if (e.target.checked) setForm({ ...form, events: [...form.events, ev] });
                            else setForm({ ...form, events: form.events.filter((x) => x !== ev) });
                          }}
                        />
                        <span className="font-mono">{ev}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{form.events.length} event(s) selected</p>
                </div>
              </div>
            )}
            <DialogFooter>
              {createdSecret ? (
                <Button onClick={() => { setCreateOpen(false); setCreatedSecret(null); }}>Done</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={() => create.mutate()} disabled={!form.name || !form.url || create.isPending}>
                    {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Webhook className="h-4 w-4" /> Configured webhooks</CardTitle>
          <CardDescription>Delivery status is recorded on each attempt</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No webhooks configured.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((w) => (
                <div key={w.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{w.name}</p>
                      {w.enabled ? <Badge variant="default" className="text-xs">Enabled</Badge> : <Badge variant="secondary" className="text-xs">Disabled</Badge>}
                      {w.lastStatus && (
                        <Badge variant={w.lastStatus === '200' ? 'default' : 'destructive'} className="text-xs">{w.lastStatus}</Badge>
                      )}
                      {w.hasSecret && <Badge variant="outline" className="text-xs">Signed</Badge>}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{w.url}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(w.events || []).slice(0, 6).map((e: string) => (
                        <Badge key={e} variant="outline" className="font-mono text-[10px] py-0">{e}</Badge>
                      ))}
                      {(w.events || []).length > 6 && <Badge variant="outline" className="text-[10px] py-0">+{w.events.length - 6} more</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {formatDistanceToNow(new Date(w.createdAt), { addSuffix: true })}
                      {w.lastSentAt && ` · last sent ${formatDistanceToNow(new Date(w.lastSentAt), { addSuffix: true })}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => del.mutate(w.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> Delete
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
