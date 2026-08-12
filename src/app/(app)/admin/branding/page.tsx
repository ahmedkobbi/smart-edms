'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { GlassCard } from '@/components/ui/premium';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Palette, Upload, Check, RotateCcw, Eye, Building2, Image as ImageIcon, Type } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { applyBranding, DEFAULT_BRANDING, COLOR_PRESETS, type BrandingConfig } from '@/lib/branding/branding-config';

export default function BrandingPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ branding: BrandingConfig }>({
    queryKey: ['branding'],
    queryFn: () => api.get('/api/admin/branding'),
  });

  useEffect(() => {
    if (data?.branding) {
      setConfig({ ...DEFAULT_BRANDING, ...data.branding });
    }
  }, [data]);

  // Live preview — apply branding CSS vars immediately on change
  useEffect(() => {
    applyBranding(config);
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<BrandingConfig>) => api.put('/api/admin/branding', updates),
    onSuccess: () => {
      toast({ title: t('branding.saved') });
      queryClient.invalidateQueries({ queryKey: ['branding'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-branding'] });
    },
    onError: (err: any) => toast({ title: t('branding.failed'), description: err?.message, variant: 'destructive' }),
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024) {
      toast({ title: t('branding.logoTooLarge'), variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setConfig(prev => ({ ...prev, logo: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setConfig(prev => ({
      ...prev,
      primaryColor: preset.primary,
      primaryForegroundColor: preset.primaryForeground,
      accentColor: preset.accent,
      accentForegroundColor: preset.accentForeground,
      chartColors: preset.chart,
    }));
    setSelectedPreset(preset.name);
  };

  const handleSave = () => {
    updateMutation.mutate(config);
  };

  const handleReset = () => {
    setConfig(DEFAULT_BRANDING);
    applyBranding(DEFAULT_BRANDING);
    setSelectedPreset('');
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Palette className="h-6 w-6 text-primary" />
          {t('branding.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('branding.subtitle')}</p>
      </motion.div>

      {/* Color Presets */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <GlassCard className="p-6" hover={false}>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            {t('branding.colorPresets')}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {COLOR_PRESETS.map(preset => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className={`glass-card rounded-xl p-3 text-start transition-all hover:border-primary/30 ${selectedPreset === preset.name ? 'border-2 border-primary ring-2 ring-primary/20' : 'border border-border'}`}
              >
                <div className="flex gap-1.5 mb-2">
                  {preset.chart.map((color, i) => (
                    <div key={i} className="w-6 h-6 rounded-md" style={{ background: color }} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ background: preset.primary }} />
                  <span className="text-xs font-medium">{preset.name}</span>
                  {selectedPreset === preset.name && <Check className="h-3 w-3 text-primary ms-auto" />}
                </div>
              </button>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      {/* Organization Identity */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <GlassCard className="p-6" hover={false}>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {t('branding.identity')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block">{t('branding.appName')}</Label>
              <Input
                className="glass-input"
                value={config.appName}
                onChange={e => setConfig(prev => ({ ...prev, appName: e.target.value }))}
                placeholder="Smart EDMS"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('branding.loginTitle')}</Label>
              <Input
                className="glass-input"
                value={config.loginTitle}
                onChange={e => setConfig(prev => ({ ...prev, loginTitle: e.target.value }))}
                placeholder="Smart EDMS"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1.5 block">{t('branding.loginSubtitle')}</Label>
              <Input
                className="glass-input"
                value={config.loginSubtitle}
                onChange={e => setConfig(prev => ({ ...prev, loginSubtitle: e.target.value }))}
                placeholder="Secure Document Governance Platform"
              />
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Logo Upload */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <GlassCard className="p-6" hover={false}>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            {t('branding.logo')}
          </h3>
          <div className="flex items-start gap-4">
            <div className="glass-card rounded-xl p-4 w-32 h-32 flex items-center justify-center shrink-0">
              {config.logo ? (
                <img src={config.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-center">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">{t('branding.noLogo')}</span>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input ref={fileInputRef} type="file" accept="image/svg,image/png,image/jpeg" className="hidden" onChange={handleLogoUpload} />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> {t('branding.uploadLogo')}
              </Button>
              {config.logo && (
                <Button variant="ghost" size="sm" onClick={() => setConfig(prev => ({ ...prev, logo: null }))}>
                  <RotateCcw className="h-4 w-4" /> {t('branding.removeLogo')}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">{t('branding.logoHint')}</p>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Live Preview */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <GlassCard className="p-6" hover={false}>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            {t('branding.preview')}
          </h3>
          <div className="rounded-xl overflow-hidden border border-border">
            {/* Preview: Login Page */}
            <div className="p-8 text-center" style={{ background: config.loginBackgroundColor }}>
              {config.logo ? (
                <img src={config.logo} alt="Logo" className="max-w-32 max-h-20 mx-auto mb-4 object-contain" />
              ) : (
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: config.primaryColor }}>
                  <span className="text-xl font-bold" style={{ color: config.primaryForegroundColor }}>
                    {config.appName.charAt(0)}
                  </span>
                </div>
              )}
              <h2 className="text-2xl font-bold text-white mb-1">{config.loginTitle}</h2>
              <p className="text-sm text-white/60 mb-4">{config.loginSubtitle}</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: config.primaryColor }}>
                <span className="text-sm font-medium" style={{ color: config.primaryForegroundColor }}>{t('branding.signInButton')}</span>
              </div>
            </div>
            {/* Preview: Sidebar */}
            <div className="flex">
              <div className="w-48 p-3 space-y-1" style={{ background: config.sidebarColor }}>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: config.primaryColor }}>
                  {config.logo ? (
                    <img src={config.logo} alt="Logo" className="w-5 h-5 object-contain" />
                  ) : (
                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: config.primaryForegroundColor }}>
                      <span className="text-[10px] font-bold" style={{ color: config.primaryColor }}>{config.appName.charAt(0)}</span>
                    </div>
                  )}
                  <span className="text-sm font-semibold" style={{ color: config.primaryForegroundColor }}>{config.appName}</span>
                </div>
                <div className="px-3 py-1.5 rounded-md text-xs" style={{ color: config.sidebarForegroundColor }}>Dashboard</div>
                <div className="px-3 py-1.5 rounded-md text-xs" style={{ color: config.sidebarForegroundColor, background: config.accentColor }}>Documents</div>
                <div className="px-3 py-1.5 rounded-md text-xs" style={{ color: config.sidebarForegroundColor }}>Audit</div>
              </div>
              <div className="flex-1 p-4 bg-background">
                <div className="flex gap-2 mb-3">
                  {config.chartColors.map((color, i) => (
                    <div key={i} className="flex-1 h-8 rounded-md" style={{ background: color }} />
                  ))}
                </div>
                <div className="h-2 rounded-full mb-2" style={{ background: config.primaryColor, width: '70%' }} />
                <div className="h-2 rounded-full mb-2 bg-muted" style={{ width: '90%' }} />
                <div className="h-2 rounded-full bg-muted" style={{ width: '50%' }} />
              </div>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={handleReset} disabled={updateMutation.isPending}>
          <RotateCcw className="h-4 w-4" /> {t('branding.reset')}
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t('branding.save')}
        </Button>
      </div>
    </div>
  );
}
