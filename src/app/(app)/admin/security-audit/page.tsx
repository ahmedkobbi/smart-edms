'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard, PremiumSkeleton, PremiumEmptyState } from '@/components/ui/premium';
import { Loader2, Shield, ShieldCheck, AlertTriangle, FileSearch, Plus, Bug, TrendingDown, TrendingUp, Activity, Clock } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SecurityAuditPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['security-audits'],
    queryFn: () => api.get('/api/security-audit'),
  });

  const scanMutation = useMutation({
    mutationFn: (scanType: string) => api.post('/api/security-audit/scan', { scanType }),
    onSuccess: (result: any) => {
      const totalIssues = result.results?.reduce((s: number, r: any) => s + r.totalIssues, 0) || 0;
      toast({ title: t('securityAudit.scanCompleted'), description: `${totalIssues} ${t('securityAudit.issuesFound')}` });
      queryClient.invalidateQueries({ queryKey: ['security-audits'] });
    },
    onError: (err: any) => toast({ title: t('securityAudit.scanFailed'), description: err?.message, variant: 'destructive' }),
  });

  const audits = data?.items || [];
  const stats = {
    total: audits.length,
    inProgress: audits.filter((a: any) => a.status === 'in_progress' || a.status === 'draft_findings').length,
    completed: audits.filter((a: any) => a.status === 'completed').length,
    criticalOpen: audits.reduce((s: number, a: any) => s + (a.criticalCount || 0), 0),
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            {t('securityAudit.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('securityAudit.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => scanMutation.mutate('full')}
            disabled={scanMutation.isPending}
            className="gap-2"
          >
            {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
            <span className="hidden sm:inline">{t('securityAudit.runFullScan')}</span>
            <span className="sm:hidden">Scan</span>
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('securityAudit.newAudit')}</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: t('securityAudit.totalAudits'), value: stats.total, icon: Shield, color: 'text-primary', bg: 'bg-primary/5' },
          { label: t('securityAudit.inProgress'), value: stats.inProgress, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/5' },
          { label: t('securityAudit.completedAudits'), value: stats.completed, icon: ShieldCheck, color: 'text-green-600', bg: 'bg-green-500/5' },
          { label: t('securityAudit.criticalFindings'), value: stats.criticalOpen, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-500/5' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <GlassCard className="p-4 md:p-5" hover={false}>
              <div className="flex items-start justify-between">
                <div>
                  <div className={`text-2xl md:text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-1">{stat.label}</div>
                </div>
                <div className={`p-2 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CreateAuditForm
              onClose={() => setShowCreate(false)}
              onCreated={() => {
                setShowCreate(false);
                queryClient.invalidateQueries({ queryKey: ['security-audits'] });
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audit List */}
      <div className="space-y-3">
        {isLoading ? (
          // Loading skeleton
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <GlassCard key={i} className="p-5" hover={false}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <PremiumSkeleton className="h-5 w-48" />
                    <PremiumSkeleton className="h-4 w-72" />
                    <div className="flex gap-3 mt-2">
                      <PremiumSkeleton className="h-4 w-20" />
                      <PremiumSkeleton className="h-4 w-20" />
                      <PremiumSkeleton className="h-4 w-20" />
                    </div>
                  </div>
                  <PremiumSkeleton className="h-12 w-12 rounded-xl" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : audits.length === 0 ? (
          // Empty state
          <PremiumEmptyState
            icon={ShieldCheck}
            title={t('securityAudit.noAudits')}
            action={
              <Button size="sm" onClick={() => scanMutation.mutate('full')} disabled={scanMutation.isPending}>
                {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                {t('securityAudit.runFullScan')}
              </Button>
            }
          />
        ) : (
          // Audit cards
          <AnimatePresence mode="popLayout">
            {audits.map((audit: any, i: number) => {
              const riskColor = audit.riskScore > 50 ? 'text-red-600' : audit.riskScore > 25 ? 'text-amber-600' : 'text-green-600';
              const riskBg = audit.riskScore > 50 ? 'bg-red-500/5' : audit.riskScore > 25 ? 'bg-amber-500/5' : 'bg-green-500/5';
              return (
                <motion.div
                  key={audit.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                >
                  <GlassCard
                    className="p-5 cursor-pointer group"
                    onClick={() => router.push(`/admin/security-audit/${audit.id}`)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold truncate">{audit.title}</h3>
                          <Badge variant="outline" className="capitalize shrink-0">{audit.framework}</Badge>
                          <Badge variant="secondary" className="capitalize shrink-0">{audit.status.replace(/_/g, ' ')}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{audit.description || 'No description'}</p>
                        <div className="flex gap-4 mt-3 text-xs flex-wrap">
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-3 w-3" /> {audit.criticalCount} {t('securityAudit.critical')}
                          </span>
                          <span className="flex items-center gap-1 text-orange-600">
                            <Bug className="h-3 w-3" /> {audit.highCount} {t('securityAudit.high')}
                          </span>
                          <span className="text-muted-foreground">
                            {audit.totalFindings} {t('securityAudit.totalFindings')}
                          </span>
                          <span className="flex items-center gap-1 text-green-600">
                            <ShieldCheck className="h-3 w-3" /> {audit.remediatedCount} {t('securityAudit.remediated')}
                          </span>
                        </div>
                      </div>
                      <div className={`flex flex-col items-center justify-center p-3 rounded-xl ${riskBg} shrink-0 transition-transform group-hover:scale-105`}>
                        <div className={`text-3xl font-bold ${riskColor}`}>{audit.riskScore}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('securityAudit.riskScore')}</div>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function CreateAuditForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [framework, setFramework] = useState('internal');
  const [scope, setScope] = useState('full');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/security-audit', data),
    onSuccess: () => { toast({ title: t('securityAudit.auditCreated') }); onCreated(); },
    onError: (err: any) => toast({ title: t('securityAudit.failed'), description: err?.message, variant: 'destructive' }),
  });

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (title.length < 3) newErrors.title = 'Minimum 3 characters';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    createMutation.mutate({ title, description, framework, scope });
  };

  return (
    <GlassCard className="p-6" hover={false}>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Plus className="h-5 w-5 text-primary" />
        {t('securityAudit.createTitle')}
      </h3>
      <div className="space-y-4">
        <div>
          <input
            className={`glass-input w-full px-3 py-2 rounded-lg transition-all focus:ring-2 ${
              errors.title ? 'ring-2 ring-red-500/30' : 'focus:ring-primary/20'
            }`}
            placeholder={t('securityAudit.auditTitle')}
            value={title}
            onChange={e => { setTitle(e.target.value); setErrors({}); }}
          />
          {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
        </div>
        <textarea
          className="glass-input w-full px-3 py-2 rounded-lg resize-none"
          placeholder={t('securityAudit.descriptionOptional')}
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('securityAudit.framework')}</label>
            <select
              className="glass-input w-full px-3 py-2 rounded-lg cursor-pointer"
              value={framework}
              onChange={e => setFramework(e.target.value)}
            >
              <option value="internal">{t('securityAudit.internal')}</option>
              <option value="iso27001">{t('securityAudit.iso27001')}</option>
              <option value="soc2">{t('securityAudit.soc2')}</option>
              <option value="gdpr">{t('securityAudit.gdpr')}</option>
              <option value="hipaa">{t('securityAudit.hipaa')}</option>
              <option value="dod501502">{t('securityAudit.dod501502')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('securityAudit.scope')}</label>
            <select
              className="glass-input w-full px-3 py-2 rounded-lg cursor-pointer"
              value={scope}
              onChange={e => setScope(e.target.value)}
            >
              <option value="full">{t('securityAudit.fullScope')}</option>
              <option value="auth">{t('securityAudit.authScope')}</option>
              <option value="documents">{t('securityAudit.documentsScope')}</option>
              <option value="billing">{t('securityAudit.billingScope')}</option>
              <option value="infrastructure">{t('securityAudit.infrastructureScope')}</option>
              <option value="api">{t('securityAudit.apiScope')}</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('securityAudit.cancel')}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!title || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('securityAudit.create')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
