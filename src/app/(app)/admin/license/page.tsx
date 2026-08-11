'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { GlassCard, PremiumEmptyState } from '@/components/ui/premium';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, KeyRound, Calendar, Building2, HardDrive, Users, ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { motion } from 'framer-motion';

export default function LicenseManagementPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [licenseKey, setLicenseKey] = useState('');

  const { data, isLoading } = useQuery<any>({
    queryKey: ['license'],
    queryFn: () => api.get('/api/license'),
  });

  const installMutation = useMutation({
    mutationFn: (key: string) => api.post('/api/license', { licenseKey: key }),
    onSuccess: () => {
      toast({ title: 'License installed successfully' });
      setLicenseKey('');
      queryClient.invalidateQueries({ queryKey: ['license'] });
      queryClient.invalidateQueries({ queryKey: ['access-status'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const license = data?.license;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <KeyRound className="h-7 w-7 text-primary" />
          {t('license.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('license.subtitle')}</p>
      </motion.div>

      {/* Current License Status */}
      {license ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard className="p-6" hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {t('license.currentLicense')}
              </h3>
              <Badge
                className={`capitalize ${
                  license.status === 'active'
                    ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                    : license.status === 'grace_period'
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'bg-red-500/10 text-red-700 dark:text-red-400'
                }`}
              >
                {license.status === 'active' && <CheckCircle className="h-3 w-3 me-1" />}
                {license.status === 'grace_period' && <AlertTriangle className="h-3 w-3 me-1" />}
                {license.status.replace(/_/g, ' ')}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Building2 className="h-3.5 w-3.5" /> {t('license.licensee')}
                </div>
                <p className="font-medium">{license.licenseeName}</p>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> {t('license.plan')}
                </div>
                <p className="font-medium capitalize">{license.plan}</p>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Users className="h-3.5 w-3.5" /> {t('license.seats')}
                </div>
                <p className="font-medium">{license.seats}</p>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <HardDrive className="h-3.5 w-3.5" /> {t('license.storage')}
                </div>
                <p className="font-medium">{(Number(license.storageBytes) / 1024 / 1024 / 1024).toFixed(1)} GB</p>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Calendar className="h-3.5 w-3.5" /> {t('license.issuedAt')}
                </div>
                <p className="font-medium">{new Date(license.issuedAt).toLocaleDateString()}</p>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Calendar className="h-3.5 w-3.5" /> {t('license.expiresAt')}
                </div>
                <p className={`font-medium ${new Date(license.expiresAt) < new Date() ? 'text-red-600' : ''}`}>
                  {new Date(license.expiresAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            {license.gracePeriodEndsAt && (
              <div className="mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {t('license.gracePeriodEnds')}: {new Date(license.gracePeriodEndsAt).toLocaleDateString()}
                </p>
              </div>
            )}

            {license.features && license.features.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">{t('license.features')}</p>
                <div className="flex flex-wrap gap-2">
                  {license.features.map((f: string, i: number) => (
                    <Badge key={i} variant="secondary" className="capitalize">{f.replace(/_/g, ' ')}</Badge>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        </motion.div>
      ) : (
        <PremiumEmptyState
          icon={KeyRound}
          title={t('license.noLicense')}
        />
      )}

      {/* Upload New License */}
      <GlassCard className="p-6" hover={false}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          {t('license.uploadNew')}
        </h3>
        <div className="space-y-3">
          <textarea
            className="glass-input w-full px-3 py-2 rounded-lg resize-none font-mono text-xs"
            placeholder={t('license.pasteKey')}
            rows={6}
            value={licenseKey}
            onChange={e => setLicenseKey(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              onClick={() => installMutation.mutate(licenseKey)}
              disabled={!licenseKey || installMutation.isPending}
            >
              {installMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t('license.install')}
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
