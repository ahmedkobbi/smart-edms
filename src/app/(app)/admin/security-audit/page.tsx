'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, Shield, ShieldCheck, AlertTriangle, FileSearch, Plus, Bug } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const severityColors: Record<string, string> = {
  critical: 'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400',
  high: 'border-orange-500/20 bg-orange-500/5 text-orange-700 dark:text-orange-400',
  medium: 'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400',
  low: 'border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-400',
  informational: 'border-gray-500/20 bg-gray-500/5 text-gray-700 dark:text-gray-400',
};

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
      toast({ title: 'Scan completed', description: `${totalIssues} issues found` });
      queryClient.invalidateQueries({ queryKey: ['security-audits'] });
    },
    onError: (err: any) => toast({ title: 'Scan failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const audits = data?.items || [];
  const stats = {
    total: audits.length,
    inProgress: audits.filter((a: any) => a.status === 'in_progress' || a.status === 'draft_findings').length,
    completed: audits.filter((a: any) => a.status === 'completed').length,
    criticalOpen: audits.reduce((s: number, a: any) => s + (a.criticalCount || 0), 0),
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Security Audit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Third-party audit preparation, automated scanning, and compliance mapping</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => scanMutation.mutate('full')} disabled={scanMutation.isPending}>
            {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
            Run Full Scan
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New Audit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <GlassCard className="p-4" hover={false}>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total Audits</div>
        </GlassCard>
        <GlassCard className="p-4" hover={false}>
          <div className="text-2xl font-bold text-amber-600">{stats.inProgress}</div>
          <div className="text-xs text-muted-foreground">In Progress</div>
        </GlassCard>
        <GlassCard className="p-4" hover={false}>
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-muted-foreground">Completed</div>
        </GlassCard>
        <GlassCard className="p-4" hover={false}>
          <div className="text-2xl font-bold text-red-600">{stats.criticalOpen}</div>
          <div className="text-xs text-muted-foreground">Critical Findings</div>
        </GlassCard>
      </div>

      {showCreate && (
        <CreateAuditForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['security-audits'] }); }} />
      )}

      <div className="space-y-3">
        {audits.length === 0 ? (
          <GlassCard className="p-12 text-center" hover={false}>
            <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No security audits yet. Create one or run a scan to get started.</p>
          </GlassCard>
        ) : (
          audits.map((audit: any, i: number) => (
            <motion.div key={audit.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="cursor-pointer" onClick={() => router.push(`/admin/security-audit/${audit.id}`)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold">{audit.title}</h3>
                      <Badge variant="outline" className="capitalize">{audit.framework}</Badge>
                      <Badge variant="secondary" className="capitalize">{audit.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{audit.description || 'No description'}</p>
                    <div className="flex gap-4 mt-3 text-xs">
                      <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> {audit.criticalCount} critical</span>
                      <span className="flex items-center gap-1"><Bug className="h-3 w-3 text-orange-500" /> {audit.highCount} high</span>
                      <span className="text-muted-foreground">{audit.totalFindings} total findings</span>
                      <span className="text-green-600">{audit.remediatedCount} remediated</span>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className={`text-3xl font-bold ${audit.riskScore > 50 ? 'text-red-600' : audit.riskScore > 25 ? 'text-amber-600' : 'text-green-600'}`}>
                      {audit.riskScore}
                    </div>
                    <div className="text-xs text-muted-foreground">Risk Score</div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function CreateAuditForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [framework, setFramework] = useState('internal');
  const [scope, setScope] = useState('full');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/security-audit', data),
    onSuccess: () => { toast({ title: 'Audit created' }); onCreated(); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">Create New Security Audit</h3>
      <div className="space-y-4">
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Audit title" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Description (optional)" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <select className="glass-input px-3 py-2 rounded-lg" value={framework} onChange={e => setFramework(e.target.value)}>
            <option value="internal">Internal</option>
            <option value="iso27001">ISO 27001</option>
            <option value="soc2">SOC 2</option>
            <option value="gdpr">GDPR</option>
            <option value="hipaa">HIPAA</option>
            <option value="dod501502">DoD 5015.02</option>
          </select>
          <select className="glass-input px-3 py-2 rounded-lg" value={scope} onChange={e => setScope(e.target.value)}>
            <option value="full">Full Scope</option>
            <option value="auth">Authentication</option>
            <option value="documents">Documents</option>
            <option value="billing">Billing</option>
            <option value="infrastructure">Infrastructure</option>
            <option value="api">API</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ title, description, framework, scope })} disabled={!title || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
