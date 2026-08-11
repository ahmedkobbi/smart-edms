'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Building2, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminTenantsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', slug: '', adminEmail: '', adminName: '', adminPassword: '',
  });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-tenants'],
    queryFn: () => api.get('/api/admin/tenants'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/tenants', form),
    onSuccess: (res: any) => {
      toast({
        title: t('admin.tenants.createdToast'),
        description: t('admin.tenants.createdToastDesc', { name: res.tenant.name, slug: res.tenant.slug, email: res.adminEmail }),
      });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      setCreateOpen(false);
      setForm({ name: '', slug: '', adminEmail: '', adminName: '', adminPassword: '' });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.tenants')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.tenants.subtitle')}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> {t('admin.tenants.newButton')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.tenants.createTitle')}</DialogTitle>
              <DialogDescription>
                {t('admin.tenants.createDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.tenants.nameLabel')}</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.tenants.slugLabel')}</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder={t('admin.tenants.slugPlaceholder')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.tenants.adminEmailLabel')}</Label>
                  <Input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.tenants.adminNameLabel')}</Label>
                  <Input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('admin.tenants.adminPasswordLabel')}</Label>
                <Input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} placeholder={t('admin.tenants.adminPasswordPlaceholder')} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancelButton')}</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || !form.slug || !form.adminEmail || !form.adminPassword || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('common.createButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> {t('admin.tenants.cardTitle')}</CardTitle>
          <CardDescription>{t('admin.tenants.cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data?.items?.filter(Boolean).map((t: any) => (
                <div key={t.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{t.name}</p>
                      <Badge variant="outline" className="font-mono text-xs">{t.slug}</Badge>
                      <Badge variant={t.status === 'active' ? 'default' : 'secondary'} className="text-xs">{t.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{t.id}</p>
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
