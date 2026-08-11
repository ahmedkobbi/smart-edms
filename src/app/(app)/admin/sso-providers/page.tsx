'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogIn, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminSsoProvidersPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', type: 'oidc' as 'oidc' | 'saml',
    issuerUrl: '', clientId: '', clientSecret: '',
    authorizationEndpoint: '', tokenEndpoint: '', userInfoEndpoint: '',
  });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-sso-providers'],
    queryFn: () => api.get('/api/admin/sso-providers'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/sso-providers', {
      name: form.name,
      type: form.type,
      issuerUrl: form.issuerUrl || undefined,
      clientId: form.clientId,
      clientSecret: form.clientSecret || undefined,
      authorizationEndpoint: form.authorizationEndpoint || undefined,
      tokenEndpoint: form.tokenEndpoint || undefined,
      userInfoEndpoint: form.userInfoEndpoint || undefined,
    }),
    onSuccess: () => {
      toast({ title: t('admin.ssoProviders.createdToast') });
      qc.invalidateQueries({ queryKey: ['admin-sso-providers'] });
      setCreateOpen(false);
      setForm({ name: '', type: 'oidc', issuerUrl: '', clientId: '', clientSecret: '', authorizationEndpoint: '', tokenEndpoint: '', userInfoEndpoint: '' });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/sso-providers/${id}`),
    onSuccess: () => {
      toast({ title: t('admin.ssoProviders.deletedToast') });
      qc.invalidateQueries({ queryKey: ['admin-sso-providers'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/admin/sso-providers/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-sso-providers'] }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.ssoProviders')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.ssoProviders.subtitle')}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> {t('admin.ssoProviders.newButton')}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('admin.ssoProviders.createTitle')}</DialogTitle>
              <DialogDescription>{t('admin.ssoProviders.createDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.ssoProviders.nameLabel')}</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('admin.ssoProviders.namePlaceholder')} />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.ssoProviders.typeLabel')}</Label>
                  <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oidc">{t('admin.ssoProviders.typeOidc')}</SelectItem>
                      <SelectItem value="saml">{t('admin.ssoProviders.typeSaml')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.type === 'oidc' && (
                <>
                  <div className="space-y-1">
                    <Label>{t('admin.ssoProviders.issuerUrlLabel')}</Label>
                    <Input value={form.issuerUrl} onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })} placeholder={t('admin.ssoProviders.issuerUrlPlaceholder')} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('admin.ssoProviders.authEndpointLabel')}</Label>
                    <Input value={form.authorizationEndpoint} onChange={(e) => setForm({ ...form, authorizationEndpoint: e.target.value })} placeholder={t('admin.ssoProviders.authEndpointPlaceholder')} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('admin.ssoProviders.tokenEndpointLabel')}</Label>
                    <Input value={form.tokenEndpoint} onChange={(e) => setForm({ ...form, tokenEndpoint: e.target.value })} placeholder={t('admin.ssoProviders.tokenEndpointPlaceholder')} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('admin.ssoProviders.userinfoEndpointLabel')}</Label>
                    <Input value={form.userInfoEndpoint} onChange={(e) => setForm({ ...form, userInfoEndpoint: e.target.value })} placeholder={t('admin.ssoProviders.userinfoEndpointPlaceholder')} />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.ssoProviders.clientIdLabel')}</Label>
                  <Input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.ssoProviders.clientSecretLabel')}</Label>
                  <Input type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('admin.ssoProviders.secretHint')}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancelButton')}</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || !form.clientId || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('common.createButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><LogIn className="h-4 w-4" /> {t('admin.ssoProviders.cardTitle')}</CardTitle>
          <CardDescription>{t('admin.ssoProviders.cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('admin.ssoProviders.empty')}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((p) => (
                <div key={p.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{p.name}</p>
                      <Badge variant="outline" className="text-xs uppercase">{p.type}</Badge>
                      {p.enabled ? <Badge variant="default" className="text-xs">{t('common.enabledBadge')}</Badge> : <Badge variant="secondary" className="text-xs">{t('common.disabledBadge')}</Badge>}
                      {p.hasSecret && <Badge variant="outline" className="text-xs">{t('admin.ssoProviders.secretSetBadge')}</Badge>}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{p.issuerUrl || p.metadataUrl || p.entityId || '—'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('common.createdAt')} {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })} · {t('admin.ssoProviders.clientIdPrefix')} <span className="font-mono">{p.clientId}</span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggle.mutate({ id: p.id, enabled: !p.enabled })}>
                      {p.enabled ? t('common.disableButton') : t('common.enableButton')}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => del.mutate(p.id)}>
                      <Trash2 className="me-1 h-3 w-3" /> {t('common.deleteButton')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
