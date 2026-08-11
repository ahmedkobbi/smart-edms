'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard, PremiumSkeleton, PremiumEmptyState } from '@/components/ui/premium';
import { Loader2, Shield, ArrowLeft, Download, Bug, CheckCircle, AlertTriangle, FileSearch } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const severityColors: Record<string, string> = {
  critical: 'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400',
  high: 'border-orange-500/20 bg-orange-500/5 text-orange-700 dark:text-orange-400',
  medium: 'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400',
  low: 'border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-400',
  informational: 'border-gray-500/20 bg-gray-500/5 text-gray-700 dark:text-gray-400',
};

export default function AuditDetailPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const auditId = params.id as string;

  const { data, isLoading } = useQuery<any>({
    queryKey: ['security-audit', auditId],
    queryFn: () => api.get(`/api/security-audit/${auditId}`),
  });

  const remediateMutation = useMutation({
    mutationFn: ({ findingId, notes }: { findingId: string; notes: string }) =>
      api.patch(`/api/security-audit/${auditId}/findings/${findingId}`, { status: 'remediated', remediation: notes }),
    onSuccess: () => { toast({ title: t('securityAudit.findingRemediated') }); queryClient.invalidateQueries({ queryKey: ['security-audit', auditId] }); },
    onError: (err: any) => toast({ title: t('securityAudit.failed'), description: err?.message, variant: 'destructive' }),
  });

  const collectEvidenceMutation = useMutation({
    mutationFn: () => api.post(`/api/security-audit/${auditId}/evidence`),
    onSuccess: () => toast({ title: 'Evidence collected' }),
    onError: (err: any) => toast({ title: t('securityAudit.failed'), description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <PremiumSkeleton className="h-9 w-20" />
          <PremiumSkeleton className="h-8 w-64" />
        </div>
        <GlassCard className="p-6" hover={false}>
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <PremiumSkeleton className="h-6 w-48" />
              <PremiumSkeleton className="h-4 w-72" />
              <div className="flex gap-2 mt-2"><PremiumSkeleton className="h-6 w-20" /><PremiumSkeleton className="h-6 w-20" /><PremiumSkeleton className="h-6 w-20" /></div>
            </div>
            <PremiumSkeleton className="h-16 w-16 rounded-xl" />
          </div>
        </GlassCard>
        <div className="grid grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => <PremiumSkeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <GlassCard key={i} className="p-4" hover={false}>
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2"><PremiumSkeleton className="h-5 w-16" /><PremiumSkeleton className="h-5 w-24" /></div>
                  <PremiumSkeleton className="h-4 w-64" />
                  <PremiumSkeleton className="h-3 w-32" />
                </div>
                <PremiumSkeleton className="h-8 w-24" />
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    );
  }

  if (!data?.audit) {
    return <PremiumEmptyState icon={Shield} title="Audit not found" />;
  }

  const audit = data.audit;
  const findings = audit.findings || [];
  const riskColor = audit.riskScore > 50 ? 'text-red-600' : audit.riskScore > 25 ? 'text-amber-600' : 'text-green-600';
  const riskBg = audit.riskScore > 50 ? 'bg-red-500/5' : audit.riskScore > 25 ? 'bg-amber-500/5' : 'bg-green-500/5';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-3"
      >
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/security-audit')}>
          <ArrowLeft className="h-4 w-4" /> {t('securityAudit.back')}
        </Button>
      </motion.div>

      {/* Audit Summary */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <GlassCard className="p-6" hover={false}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                {audit.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{audit.description || 'No description'}</p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <Badge variant="outline" className="capitalize">{audit.framework}</Badge>
                <Badge variant="secondary" className="capitalize">{audit.scope}</Badge>
                <Badge variant="outline" className="capitalize">{audit.status.replace(/_/g, ' ')}</Badge>
                {audit.auditorName && <Badge variant="outline">{audit.auditorName}</Badge>}
              </div>
            </div>
            <div className={`flex flex-col items-center justify-center p-4 rounded-xl ${riskBg} shrink-0`}>
              <div className={`text-4xl font-bold ${riskColor}`}>{audit.riskScore}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('securityAudit.riskScore')}</div>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: t('securityAudit.critical'), value: audit._counts?.critical || 0, color: 'text-red-600', bg: 'bg-red-500/5' },
          { label: t('securityAudit.high'), value: audit._counts?.high || 0, color: 'text-orange-600', bg: 'bg-orange-500/5' },
          { label: t('securityAudit.medium'), value: audit._counts?.medium || 0, color: 'text-amber-600', bg: 'bg-amber-500/5' },
          { label: t('securityAudit.low'), value: audit._counts?.low || 0, color: 'text-blue-600', bg: 'bg-blue-500/5' },
          { label: t('securityAudit.remediated'), value: audit._counts?.remediated || 0, color: 'text-green-600', bg: 'bg-green-500/5' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }}>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => collectEvidenceMutation.mutate()} disabled={collectEvidenceMutation.isPending}>
          {collectEvidenceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
          <span className="hidden sm:inline ms-1">Collect Evidence</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.open(`/api/security-audit/${auditId}?format=report`, '_blank')}>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline ms-1">{t('securityAudit.exportReport')}</span>
        </Button>
      </div>

      {/* Findings */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bug className="h-5 w-5" />
          {t('securityAudit.findings')} ({findings.length})
        </h2>

        {findings.length === 0 ? (
          <PremiumEmptyState icon={CheckCircle} title={t('securityAudit.noFindings')} />
        ) : (
          <AnimatePresence mode="popLayout">
            {findings.map((finding: any, i: number) => (
              <motion.div key={finding.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ delay: i * 0.05 }}>
                <GlassCard className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge className={`capitalize ${severityColors[finding.severity] || severityColors.medium}`} variant="outline">{finding.severity}</Badge>
                        <Badge variant="outline" className="font-mono">{finding.findingId}</Badge>
                        {finding.cvssScore && <Badge variant="secondary">CVSS: {finding.cvssScore}</Badge>}
                        {finding.cweId && <Badge variant="outline">{finding.cweId}</Badge>}
                        <Badge variant="secondary" className="capitalize">{finding.status.replace(/_/g, ' ')}</Badge>
                      </div>
                      <h3 className="font-medium">{finding.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{finding.description}</p>
                      {finding.affectedComponent && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <span className="font-medium">{t('securityAudit.component')}:</span>
                          <code className="glass-input px-1.5 py-0.5 rounded font-mono text-xs">{finding.affectedComponent}</code>
                        </p>
                      )}
                      {finding.remediation && (
                        <div className="mt-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                          <p className="text-xs text-green-700 dark:text-green-400">
                            <strong>{t('securityAudit.remediation')}:</strong> {finding.remediation}
                          </p>
                        </div>
                      )}
                    </div>
                    {finding.status === 'open' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          const notes = prompt(t('securityAudit.enterRemediationNotes'));
                          if (notes) remediateMutation.mutate({ findingId: finding.id, notes });
                        }}
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span className="hidden sm:inline ms-1">{t('securityAudit.remediate')}</span>
                      </Button>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
