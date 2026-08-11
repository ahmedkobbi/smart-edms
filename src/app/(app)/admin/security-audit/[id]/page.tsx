'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, Shield, ArrowLeft, Download, Bug, CheckCircle } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useParams, useRouter } from 'next/navigation';

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

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const audit = data.audit;
  const findings = audit.findings || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/security-audit')}>
          <ArrowLeft className="h-4 w-4" /> {t('securityAudit.back')}
        </Button>
      </div>

      <GlassCard className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              {audit.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{audit.description || 'No description'}</p>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="capitalize">{audit.framework}</Badge>
              <Badge variant="secondary" className="capitalize">{audit.scope}</Badge>
              <Badge variant="outline" className="capitalize">{audit.status.replace(/_/g, ' ')}</Badge>
            </div>
          </div>
          <div className="text-end">
            <div className={`text-4xl font-bold ${audit.riskScore > 50 ? 'text-red-600' : audit.riskScore > 25 ? 'text-amber-600' : 'text-green-600'}`}>
              {audit.riskScore}
            </div>
            <div className="text-xs text-muted-foreground">{t('securityAudit.riskScore')}</div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-red-600">{audit._counts.critical}</div>
          <div className="text-xs text-muted-foreground">{t('securityAudit.critical')}</div>
        </GlassCard>
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-orange-600">{audit._counts.high}</div>
          <div className="text-xs text-muted-foreground">High</div>
        </GlassCard>
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-amber-600">{audit._counts.medium}</div>
          <div className="text-xs text-muted-foreground">{t('securityAudit.medium')}</div>
        </GlassCard>
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-blue-600">{audit._counts.low}</div>
          <div className="text-xs text-muted-foreground">{t('securityAudit.low')}</div>
        </GlassCard>
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-green-600">{audit._counts.remediated}</div>
          <div className="text-xs text-muted-foreground">{t('securityAudit.remediated')}</div>
        </GlassCard>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Bug className="h-5 w-5" /> {t('securityAudit.findings')} ({findings.length})</h2>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/security-audit/${auditId}?format=report`, '_blank')}>
            <Download className="h-4 w-4" /> {t('securityAudit.exportReport')}
          </Button>
        </div>

        {findings.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}>
            <CheckCircle className="h-10 w-10 mx-auto text-green-500 mb-2" />
            <p className="text-muted-foreground">{t('securityAudit.noFindings')}</p>
          </GlassCard>
        ) : (
          findings.map((finding: any) => (
            <GlassCard key={finding.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`capitalize ${severityColors[finding.severity]}`}>{finding.severity}</Badge>
                    <Badge variant="outline">{finding.findingId}</Badge>
                    {finding.cvssScore && <Badge variant="secondary">CVSS: {finding.cvssScore}</Badge>}
                    {finding.cweId && <Badge variant="outline">{finding.cweId}</Badge>}
                    <Badge variant="secondary" className="capitalize">{finding.status.replace(/_/g, ' ')}</Badge>
                  </div>
                  <h3 className="font-medium">{finding.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{finding.description}</p>
                  {finding.affectedComponent && (
                    <p className="text-xs text-muted-foreground mt-2">{t('securityAudit.component')}: <code className="glass-input px-1.5 py-0.5 rounded">{finding.affectedComponent}</code></p>
                  )}
                  {finding.remediation && (
                    <div className="mt-2 p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                      <p className="text-xs text-green-700 dark:text-green-400"><strong>{t('securityAudit.remediation')}:</strong> {finding.remediation}</p>
                    </div>
                  )}
                </div>
                {finding.status === 'open' && (
                  <Button size="sm" variant="outline" onClick={() => {
                    const notes = prompt(t('securityAudit.enterRemediationNotes'));
                    if (notes) remediateMutation.mutate({ findingId: finding.id, notes });
                  }}>
                    <CheckCircle className="h-4 w-4" /> {t('securityAudit.remediate')}
                  </Button>
                )}
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}
