'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2, Palette, ToggleLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminTenantPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [localState, setLocalState] = useState<{
    name: string;
    brandingPrimary: string;
    brandingAccent: string;
    aiEnabled: boolean;
    watermarkEnabled: boolean;
    ocrEnabled: boolean;
    ocrLanguages: string[];
    ocrDpi: string;
    ocrMaxPages: string;
    ocrMinConfidence: string;
    residency: string;
  } | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['admin-tenant'],
    queryFn: () => api.get('/api/admin/tenant'),
  });

  // Derive form state from server data, falling back to local edits
  const form = localState ?? {
    name: data?.tenant?.name || '',
    brandingPrimary: data?.tenant?.settings?.branding?.primary || '#0f172a',
    brandingAccent: data?.tenant?.settings?.branding?.accent || '#0ea5e9',
    aiEnabled: data?.tenant?.settings?.features?.ai !== false,
    watermarkEnabled: data?.tenant?.settings?.features?.watermark !== false,
    ocrEnabled: data?.tenant?.settings?.features?.ocr !== false,
    ocrLanguages: data?.tenant?.settings?.ocr?.languages || ['eng', 'ara'],
    ocrDpi: String(data?.tenant?.settings?.ocr?.dpi || 300),
    ocrMaxPages: String(data?.tenant?.settings?.ocr?.maxPages || 50),
    ocrMinConfidence: String(data?.tenant?.settings?.ocr?.minConfidence || 70),
    residency: data?.tenant?.settings?.residency || 'default',
  };

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setLocalState({ ...form, [key]: value });
  }

  const save = useMutation({
    mutationFn: () => api.patch('/api/admin/tenant', {
      name: form.name,
      settings: {
        branding: { primary: form.brandingPrimary, accent: form.brandingAccent },
        features: { ai: form.aiEnabled, watermark: form.watermarkEnabled, ocr: form.ocrEnabled },
        ocr: {
          languages: form.ocrLanguages,
          dpi: parseInt(form.ocrDpi, 10),
          maxPages: parseInt(form.ocrMaxPages, 10),
          minConfidence: parseInt(form.ocrMinConfidence, 10),
        },
        residency: form.residency,
      },
    }),
    onSuccess: () => {
      toast({ title: t('admin.tenant.savedToast') });
      qc.invalidateQueries({ queryKey: ['admin-tenant'] });
      setLocalState(null);
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.tenantSettings')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('admin.tenant.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> {t('admin.tenant.identityCardTitle')}</CardTitle>
          <CardDescription>{t('admin.tenant.identityCardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">{t('admin.tenant.tenantNameLabel')}</Label>
            <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('admin.tenant.slugLabel')}</Label>
            <p className="text-sm font-mono text-muted-foreground">{data.tenant.slug}</p>
            <p className="text-xs text-muted-foreground">{t('admin.tenant.slugImmutable')}</p>
          </div>
          <div className="space-y-1">
            <Label>{t('admin.tenant.statusLabel')}</Label>
            <Badge variant={data.tenant.status === 'active' ? 'default' : 'secondary'}>{data.tenant.status}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" /> {t('admin.tenant.brandingCardTitle')}</CardTitle>
          <CardDescription>{t('admin.tenant.brandingCardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('admin.tenant.primaryColorLabel')}</Label>
              <div className="flex gap-2 items-center">
                <Input type="color" value={form.brandingPrimary} onChange={(e) => update('brandingPrimary', e.target.value)} className="w-16 h-10 p-1" />
                <Input value={form.brandingPrimary} onChange={(e) => update('brandingPrimary', e.target.value)} className="flex-1 font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('admin.tenant.accentColorLabel')}</Label>
              <div className="flex gap-2 items-center">
                <Input type="color" value={form.brandingAccent} onChange={(e) => update('brandingAccent', e.target.value)} className="w-16 h-10 p-1" />
                <Input value={form.brandingAccent} onChange={(e) => update('brandingAccent', e.target.value)} className="flex-1 font-mono" />
              </div>
            </div>
          </div>
          <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-muted-foreground mb-2">{t('admin.tenant.previewLabel')}</p>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: form.brandingPrimary }}>
                <span className="text-white text-xs font-bold">S</span>
              </div>
              <span className="font-semibold" style={{ color: form.brandingPrimary }}>Smart EDMS</span>
              <Badge style={{ backgroundColor: form.brandingAccent, color: 'white' }}>{t('admin.tenant.accentBadge')}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ToggleLeft className="h-4 w-4" /> {t('admin.tenant.featureFlagsCardTitle')}</CardTitle>
          <CardDescription>{t('admin.tenant.featureFlagsCardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('admin.tenant.aiFeaturesTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('admin.tenant.aiFeaturesDesc')}</p>
            </div>
            <Switch checked={form.aiEnabled} onCheckedChange={(v) => update('aiEnabled', v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('admin.tenant.watermarkingTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('admin.tenant.watermarkingDesc')}</p>
            </div>
            <Switch checked={form.watermarkEnabled} onCheckedChange={(v) => update('watermarkEnabled', v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('admin.tenant.ocrTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('admin.tenant.ocrDesc')}</p>
            </div>
            <Switch checked={form.ocrEnabled} onCheckedChange={(v) => update('ocrEnabled', v)} />
          </div>
          {form.ocrEnabled && (
            <div className="space-y-3 ps-4 border-s-2 border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <Label className="text-xs">{t('admin.tenant.ocrLanguagesLabel')}</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { code: 'eng', label: 'admin.tenant.langEnglish' },
                    { code: 'ara', label: 'admin.tenant.langArabic' },
                    { code: 'fra', label: 'admin.tenant.langFrench' },
                    { code: 'spa', label: 'admin.tenant.langSpanish' },
                    { code: 'deu', label: 'admin.tenant.langGerman' },
                  ].map((lang) => (
                    <Button
                      key={lang.code}
                      type="button"
                      variant={form.ocrLanguages.includes(lang.code) ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const langs = form.ocrLanguages.includes(lang.code)
                          ? form.ocrLanguages.filter((l) => l !== lang.code)
                          : [...form.ocrLanguages, lang.code];
                        update('ocrLanguages', langs.length > 0 ? langs : ['eng']);
                      }}
                    >
                      {t(lang.label)}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('admin.tenant.selectedPrefix')} {form.ocrLanguages.join(', ')}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('admin.tenant.renderDpiLabel')}</Label>
                  <Input type="number" min="72" max="600" value={form.ocrDpi} onChange={(e) => update('ocrDpi', e.target.value)} className="h-8 text-sm" />
                  <p className="text-[10px] text-muted-foreground">{t('admin.tenant.renderDpiHint')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('admin.tenant.maxPagesLabel')}</Label>
                  <Input type="number" min="1" max="500" value={form.ocrMaxPages} onChange={(e) => update('ocrMaxPages', e.target.value)} className="h-8 text-sm" />
                  <p className="text-[10px] text-muted-foreground">{t('admin.tenant.maxPagesHint')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('admin.tenant.minConfidenceLabel')}</Label>
                  <Input type="number" min="0" max="100" value={form.ocrMinConfidence} onChange={(e) => update('ocrMinConfidence', e.target.value)} className="h-8 text-sm" />
                  <p className="text-[10px] text-muted-foreground">{t('admin.tenant.minConfidenceHint')}</p>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>{t('admin.tenant.residencyLabel')}</Label>
            <Input value={form.residency} onChange={(e) => update('residency', e.target.value)} placeholder={t('admin.tenant.residencyPlaceholder')} />
            <p className="text-xs text-muted-foreground">{t('admin.tenant.residencyHint')}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {localState && (
          <Button variant="outline" onClick={() => setLocalState(null)}>
            {t('common.resetButton')}
          </Button>
        )}
        <Button onClick={() => save.mutate()} disabled={save.isPending || !localState}>
          {save.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          {t('admin.tenant.saveButton')}
        </Button>
      </div>
    </div>
  );
}
