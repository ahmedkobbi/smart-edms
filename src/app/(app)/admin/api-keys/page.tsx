'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { KeyRound, Loader2, Plus, Trash2, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { PERMISSIONS } from '@/lib/auth/permissions.client';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminApiKeysPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', scopes: [] as string[] });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-api-keys'],
    queryFn: () => api.get('/api/admin/api-keys'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/api-keys', form),
    onSuccess: (res: any) => {
      setCreatedKey(res.key);
      qc.invalidateQueries({ queryKey: ['admin-api-keys'] });
      setForm({ name: '', description: '', scopes: [] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/api-keys/${id}`),
    onSuccess: () => {
      toast({ title: t('admin.apiKeys.revokedToast') });
      qc.invalidateQueries({ queryKey: ['admin-api-keys'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.apiKeys')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.apiKeys.subtitle')}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setCreatedKey(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> {t('admin.apiKeys.newButton')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdKey ? t('admin.apiKeys.createdTitle') : t('admin.apiKeys.createTitle')}</DialogTitle>
              <DialogDescription>
                {createdKey ? t('admin.apiKeys.createdDesc') : t('admin.apiKeys.createDesc')}
              </DialogDescription>
            </DialogHeader>
            {createdKey ? (
              <div className="space-y-3 py-2">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
                  <p className="font-mono text-xs break-all">{createdKey}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(createdKey); toast({ title: t('common.copiedToast') }); }}>
                  <Copy className="me-2 h-3.5 w-3.5" /> {t('common.copyButton')}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>{t('admin.apiKeys.nameLabel')}</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('admin.apiKeys.namePlaceholder')} />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.apiKeys.descriptionLabel')}</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.apiKeys.scopesLabel')}</Label>
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
                <Button onClick={() => { setCreateOpen(false); setCreatedKey(null); }}>{t('common.doneButton')}</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancelButton')}</Button>
                  <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
                    {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t('common.createButton')}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> {t('admin.apiKeys.cardTitle')}</CardTitle>
          <CardDescription>{t('admin.apiKeys.cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('admin.apiKeys.empty')}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((k) => (
                <div key={k.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{k.name}</p>
                      <Badge variant="secondary" className="font-mono text-xs">{k.keyPrefix}…</Badge>
                      {k.expiresAt && (
                        <Badge variant="outline" className="text-xs">{t('common.expiresPrefix')} {formatDistanceToNow(new Date(k.expiresAt), { addSuffix: true })}</Badge>
                      )}
                    </div>
                    {k.description && <p className="text-xs text-muted-foreground mt-0.5">{k.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(k.scopes || []).slice(0, 5).map((s: string) => (
                        <Badge key={s} variant="outline" className="font-mono text-[10px] py-0">{s}</Badge>
                      ))}
                      {(k.scopes || []).length > 5 && <Badge variant="outline" className="text-[10px] py-0">{t('common.more', { count: k.scopes.length - 5 })}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('common.createdAt')} {formatDistanceToNow(new Date(k.createdAt), { addSuffix: true })}
                      {k.lastUsedAt && ` · ${t('common.lastUsedPrefix')} ${formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => revoke.mutate(k.id)}>
                    <Trash2 className="me-1 h-3 w-3" /> {t('common.revokeButton')}
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
