'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Bot, Loader2, Plus, Trash2, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { PERMISSIONS } from '@/lib/auth/permissions.client';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminServiceAccountsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', scopes: [] as string[], expiresAt: '' });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-service-accounts'],
    queryFn: () => api.get('/api/admin/service-accounts'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/service-accounts', {
      ...form,
      expiresAt: form.expiresAt || undefined,
    }),
    onSuccess: (res: any) => {
      setCreatedKey(res.key);
      qc.invalidateQueries({ queryKey: ['admin-service-accounts'] });
      setForm({ name: '', description: '', scopes: [], expiresAt: '' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/service-accounts/${id}`),
    onSuccess: () => {
      toast({ title: 'Service account revoked' });
      qc.invalidateQueries({ queryKey: ['admin-service-accounts'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.serviceAccounts')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Non-human identities for automation, integrations, and CI/CD pipelines.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setCreatedKey(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New service account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdKey ? 'Service account created' : 'Create service account'}</DialogTitle>
              <DialogDescription>
                {createdKey ? 'Copy this key now. It will not be shown again.' : 'Issue credentials for non-human access.'}
              </DialogDescription>
            </DialogHeader>
            {createdKey ? (
              <div className="space-y-3 py-2">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
                  <p className="font-mono text-xs break-all">{createdKey}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(createdKey); toast({ title: 'Copied' }); }}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                </Button>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ci-runner" />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Expires at (optional)</Label>
                  <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Scopes</Label>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md p-2 space-y-1">
                    {Object.values(PERMISSIONS).map((p) => (
                      <label key={p} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={form.scopes.includes(p)}
                          onChange={(e) => {
                            if (e.target.checked) setForm({ ...form, scopes: [...form.scopes, p] });
                            else setForm({ ...form, scopes: form.scopes.filter((x) => x !== p) });
                          }}
                        />
                        <span className="font-mono">{p}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              {createdKey ? (
                <Button onClick={() => { setCreateOpen(false); setCreatedKey(null); }}>Done</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
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
          <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> Active service accounts</CardTitle>
          <CardDescription>For automation — never use human credentials in scripts</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No service accounts.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((s) => (
                <div key={s.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{s.name}</p>
                      <Badge variant="secondary" className="font-mono text-xs">{s.keyPrefix}…</Badge>
                      {s.expiresAt && (
                        <Badge variant="outline" className="text-xs">Expires {formatDistanceToNow(new Date(s.expiresAt), { addSuffix: true })}</Badge>
                      )}
                    </div>
                    {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(s.scopes || []).slice(0, 5).map((sc: string) => (
                        <Badge key={sc} variant="outline" className="font-mono text-[10px] py-0">{sc}</Badge>
                      ))}
                      {(s.scopes || []).length > 5 && <Badge variant="outline" className="text-[10px] py-0">+{s.scopes.length - 5} more</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                      {s.lastUsedAt && ` · last used ${formatDistanceToNow(new Date(s.lastUsedAt), { addSuffix: true })}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => revoke.mutate(s.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> Revoke
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
