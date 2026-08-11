#!/usr/bin/env python3
"""Generate all admin UI pages for the 4 new features."""

import os

PAGES = {
    # =========================================================================
    # FEATURE 1: SECURITY AUDIT
    # =========================================================================
    "src/app/(app)/admin/security-audit/page.tsx": ''''use client';

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
              <GlassCard className="p-5 cursor-pointer" onClick={() => router.push(`/admin/security-audit/${audit.id}`)}>
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
              </GlassCard>
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
''',

    "src/app/(app)/admin/security-audit/[id]/page.tsx": ''''use client';

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
    onSuccess: () => { toast({ title: 'Finding remediated' }); queryClient.invalidateQueries({ queryKey: ['security-audit', auditId] }); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
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
          <ArrowLeft className="h-4 w-4" /> Back
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
            <div className="text-xs text-muted-foreground">Risk Score</div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-red-600">{audit._counts.critical}</div>
          <div className="text-xs text-muted-foreground">Critical</div>
        </GlassCard>
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-orange-600">{audit._counts.high}</div>
          <div className="text-xs text-muted-foreground">High</div>
        </GlassCard>
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-amber-600">{audit._counts.medium}</div>
          <div className="text-xs text-muted-foreground">Medium</div>
        </GlassCard>
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-blue-600">{audit._counts.low}</div>
          <div className="text-xs text-muted-foreground">Low</div>
        </GlassCard>
        <GlassCard className="p-3 text-center" hover={false}>
          <div className="text-xl font-bold text-green-600">{audit._counts.remediated}</div>
          <div className="text-xs text-muted-foreground">Remediated</div>
        </GlassCard>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Bug className="h-5 w-5" /> Findings ({findings.length})</h2>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/security-audit/${auditId}?format=report`, '_blank')}>
            <Download className="h-4 w-4" /> Export Report
          </Button>
        </div>

        {findings.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}>
            <CheckCircle className="h-10 w-10 mx-auto text-green-500 mb-2" />
            <p className="text-muted-foreground">No findings recorded yet. Run a scan to detect issues.</p>
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
                    <p className="text-xs text-muted-foreground mt-2">Component: <code className="glass-input px-1.5 py-0.5 rounded">{finding.affectedComponent}</code></p>
                  )}
                  {finding.remediation && (
                    <div className="mt-2 p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                      <p className="text-xs text-green-700 dark:text-green-400"><strong>Remediation:</strong> {finding.remediation}</p>
                    </div>
                  )}
                </div>
                {finding.status === 'open' && (
                  <Button size="sm" variant="outline" onClick={() => {
                    const notes = prompt('Enter remediation notes:');
                    if (notes) remediateMutation.mutate({ findingId: finding.id, notes });
                  }}>
                    <CheckCircle className="h-4 w-4" /> Remediate
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
''',

    # =========================================================================
    # FEATURE 2: E-SIGNATURE
    # =========================================================================
    "src/app/(app)/admin/signatures/page.tsx": ''''use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, PenTool, FileText, Clock, CheckCircle, XCircle, Eye, Ban } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { motion } from 'framer-motion';

const statusConfig: Record<string, { color: string; icon: any }> = {
  draft: { color: 'border-gray-500/20 bg-gray-500/5', icon: FileText },
  sent: { color: 'border-blue-500/20 bg-blue-500/5', icon: Clock },
  delivered: { color: 'border-blue-500/20 bg-blue-500/5', icon: Clock },
  completed: { color: 'border-green-500/20 bg-green-500/5', icon: CheckCircle },
  declined: { color: 'border-red-500/20 bg-red-500/5', icon: XCircle },
  expired: { color: 'border-amber-500/20 bg-amber-500/5', icon: Clock },
  voided: { color: 'border-gray-500/20 bg-gray-500/5', icon: Ban },
};

export default function SignaturesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['signatures'],
    queryFn: () => api.get('/api/signatures'),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/api/signatures/${id}/void`, { reason }),
    onSuccess: () => { toast({ title: 'Request voided' }); queryClient.invalidateQueries({ queryKey: ['signatures'] }); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const requests = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <PenTool className="h-6 w-6 text-primary" />
            E-Signatures
          </h1>
          <p className="text-sm text-muted-foreground mt-1">DocuSign and Adobe Sign integration for electronic signatures</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <PenTool className="h-4 w-4" /> New Signature Request
        </Button>
      </div>

      {showCreate && <CreateSignatureForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['signatures'] }); }} />}

      <div className="space-y-3">
        {requests.length === 0 ? (
          <GlassCard className="p-12 text-center" hover={false}>
            <PenTool className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No signature requests yet.</p>
          </GlassCard>
        ) : (
          requests.map((req: any, i: number) => {
            const config = statusConfig[req.status] || statusConfig.draft;
            const Icon = config.icon;
            const recipients = typeof req.recipients === 'string' ? JSON.parse(req.recipients) : req.recipients;
            return (
              <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <GlassCard className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4" />
                        <h3 className="font-semibold">{req.document?.title || 'Unknown document'}</h3>
                        <Badge className={`capitalize ${config.color}`}>{req.status}</Badge>
                        <Badge variant="outline" className="capitalize">{req.provider.replace('_', ' ')}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {recipients?.map((r: any, idx: number) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {r.name} ({r.email})
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Sent: {req.sentAt ? new Date(req.sentAt).toLocaleDateString() : '—'}</span>
                        <span>Expires: {req.expiresAt ? new Date(req.expiresAt).toLocaleDateString() : '—'}</span>
                        {req.completedAt && <span className="text-green-600">Completed: {new Date(req.completedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {(req.status === 'sent' || req.status === 'delivered') && (
                      <Button size="sm" variant="outline" onClick={() => {
                        const reason = prompt('Reason for voiding:');
                        if (reason) voidMutation.mutate({ id: req.id, reason });
                      }}>
                        <Ban className="h-4 w-4" /> Void
                      </Button>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CreateSignatureForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [documentId, setDocumentId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState([{ email: '', name: '', role: 'signer', routingOrder: 1 }]);
  const [expiryDays, setExpiryDays] = useState(30);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/signatures', data),
    onSuccess: () => { toast({ title: 'Signature request sent' }); onCreated(); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">New Signature Request</h3>
      <div className="space-y-4">
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Document ID" value={documentId} onChange={e => setDocumentId(e.target.value)} />
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Email subject" value={subject} onChange={e => setSubject(e.target.value)} />
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Message to recipients (optional)" rows={2} value={message} onChange={e => setMessage(e.target.value)} />
        <div className="space-y-2">
          {recipients.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input className="glass-input flex-1 px-3 py-2 rounded-lg" placeholder="Name" value={r.name} onChange={e => { const v = [...recipients]; v[i].name = e.target.value; setRecipients(v); }} />
              <input className="glass-input flex-1 px-3 py-2 rounded-lg" placeholder="Email" value={r.email} onChange={e => { const v = [...recipients]; v[i].email = e.target.value; setRecipients(v); }} />
              {recipients.length > 1 && (
                <Button variant="outline" size="sm" onClick={() => setRecipients(recipients.filter((_, idx) => idx !== i))}>Remove</Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRecipients([...recipients, { email: '', name: '', role: 'signer', routingOrder: recipients.length + 1 }])}>+ Add Recipient</Button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Expiry (days):</label>
          <input type="number" className="glass-input w-24 px-3 py-2 rounded-lg" value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value))} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ documentId, provider: 'internal', recipients, emailConfig: { subject, message, expiryDays } })} disabled={!documentId || !subject || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
''',

    # =========================================================================
    # FEATURE 3: BPMN DESIGNER
    # =========================================================================
    "src/app/(app)/admin/bpmn-designer/page.tsx": ''''use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, Workflow, Plus, Play, Eye } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';

export default function BpmnDesignerPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['bpmn-definitions'],
    queryFn: () => api.get('/api/bpmn/definitions'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const definitions = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Workflow className="h-6 w-6 text-primary" />
            BPMN Workflow Designer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Visually design and publish BPMN 2.0 workflow processes</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New Process
        </Button>
      </div>

      {showCreate && <CreateProcessForm onClose={() => setShowCreate(false)} onCreated={(id: string) => { setShowCreate(false); router.push(`/admin/bpmn-designer/${id}`); }} />}

      <div className="space-y-3">
        {definitions.length === 0 ? (
          <GlassCard className="p-12 text-center" hover={false}>
            <Workflow className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No BPMN processes yet. Create one to start designing.</p>
          </GlassCard>
        ) : (
          definitions.map((def: any, i: number) => (
            <motion.div key={def.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <GlassCard className="p-5 cursor-pointer" onClick={() => router.push(`/admin/bpmn-designer/${def.id}`)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{def.name}</h3>
                      <Badge variant="outline">v{def.version}</Badge>
                      <Badge variant="secondary" className="capitalize">{def.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{def.description || 'No description'}</p>
                    <div className="text-xs text-muted-foreground mt-2">
                      Key: <code className="glass-input px-1.5 py-0.5 rounded">{def.processKey}</code>
                      {def.publishedAt && <span className="ms-3">Published: {new Date(def.publishedAt).toLocaleDateString()}</span>}
                      <span className="ms-3">{def._count?.instances || 0} instances</span>
                    </div>
                  </div>
                  <Eye className="h-5 w-5 text-muted-foreground" />
                </div>
              </GlassCard>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function CreateProcessForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [processKey, setProcessKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const template = await api.post('/api/bpmn/definitions/template', { processKey: data.processKey, name: data.name });
      return api.post('/api/bpmn/definitions', { ...data, bpmnXml: template.xml });
    },
    onSuccess: (result: any) => { toast({ title: 'Process created' }); onCreated(result.definition.id); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">Create New BPMN Process</h3>
      <div className="space-y-4">
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Process key (e.g., invoice_approval)" value={processKey} onChange={e => setProcessKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Process name" value={name} onChange={e => setName(e.target.value)} />
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Description (optional)" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ processKey, name, description })} disabled={!processKey || !name || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
''',

    "src/app/(app)/admin/bpmn-designer/[id]/page.tsx": ''''use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, Workflow, Save, Play, ArrowLeft } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function BpmnEditorPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const defId = params.id as string;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [xml, setXml] = useState('');
  const [modeler, setModeler] = useState<any>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['bpmn-definition', defId],
    queryFn: () => api.get(`/api/bpmn/definitions/${defId}`),
  });

  const saveMutation = useMutation({
    mutationFn: (newXml: string) => api.post('/api/bpmn/definitions', {
      processKey: data.definition.processKey,
      name: data.definition.name,
      description: data.definition.description,
      bpmnXml: newXml,
    }),
    onSuccess: () => { toast({ title: 'Saved' }); queryClient.invalidateQueries({ queryKey: ['bpmn-definition', defId] }); queryClient.invalidateQueries({ queryKey: ['bpmn-definitions'] }); },
    onError: (err: any) => toast({ title: 'Save failed', description: err?.message, variant: 'destructive' }),
  });

  const publishMutation = useMutation({
    mutationFn: () => api.post(`/api/bpmn/definitions/${defId}/publish`),
    onSuccess: () => { toast({ title: 'Process published' }); queryClient.invalidateQueries({ queryKey: ['bpmn-definition', defId] }); },
    onError: (err: any) => toast({ title: 'Publish failed', description: err?.message, variant: 'destructive' }),
  });

  useEffect(() => {
    if (!data?.definition || modeler) return;

    // Dynamically import bpmn-js (client-side only)
    import('bpmn-js/lib/Modeler').then(async (Module: any) => {
      const Modeler = Module.default;
      const m = new Modeler({ container: canvasRef.current });
      try {
        await m.importXML(data.definition.bpmnXml);
        setModeler(m);
      } catch (err) {
        console.error('BPMN import failed', err);
      }
    }).catch(err => {
      console.warn('bpmn-js not available, showing XML editor only', err);
    });

    return () => { if (modeler) modeler.destroy(); };
  }, [data]);

  const handleSave = async () => {
    if (modeler) {
      try {
        const result = await modeler.saveXML({ format: true });
        saveMutation.mutate(result.xml);
      } catch (err) {
        toast({ title: 'Export failed', variant: 'destructive' });
      }
    } else {
      saveMutation.mutate(xml);
    }
  };

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const def = data.definition;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/bpmn-designer')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            {def.name}
          </h1>
          <Badge variant="outline">v{def.version}</Badge>
          <Badge variant="secondary" className="capitalize">{def.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4" /> {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
          {def.status === 'draft' && (
            <Button size="sm" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              <Play className="h-4 w-4" /> {publishMutation.isPending ? 'Publishing...' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      <GlassCard className="p-0 overflow-hidden" hover={false}>
        <div ref={canvasRef} className="w-full h-[600px] bg-white dark:bg-gray-900" />
      </GlassCard>

      {def.parsedElements && (
        <GlassCard className="p-4" hover={false}>
          <h3 className="text-sm font-semibold mb-2">Parsed Elements</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><span className="text-muted-foreground">Start Events:</span> {def.parsedElements.startEvent ? 1 : 0}</div>
            <div><span className="text-muted-foreground">End Events:</span> {def.parsedElements.endEvents?.length || 0}</div>
            <div><span className="text-muted-foreground">User Tasks:</span> {def.parsedElements.userTasks?.length || 0}</div>
            <div><span className="text-muted-foreground">Gateways:</span> {def.parsedElements.gateways?.length || 0}</div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
''',

    # =========================================================================
    # FEATURE 4: DoD 5015.02 RECORDS MANAGEMENT
    # =========================================================================
    "src/app/(app)/admin/records-management/page.tsx": ''''use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, FolderTree, ShieldCheck, AlertCircle, FileCheck, Download } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function RecordsManagementPage() {
  const { t } = useI18n();
  const router = useRouter();

  const { data: reportData, isLoading: reportLoading } = useQuery<any>({
    queryKey: ['dod-compliance-report'],
    queryFn: () => api.get('/api/records/compliance-report'),
  });

  const { data: categoriesData } = useQuery<any>({
    queryKey: ['record-categories'],
    queryFn: () => api.get('/api/records/categories'),
  });

  if (reportLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const report = reportData;
  const categories = categoriesData?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-primary" />
            Records Management (DoD 5015.02)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">DoD 5015.02-compliant records management with file plans, vital records, and disposition</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/records-management/folders')}>
            <FolderTree className="h-4 w-4" /> Folders
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/records-management/vital')}>
            <ShieldCheck className="h-4 w-4" /> Vital Records
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/records-management/authorities')}>
            <FileCheck className="h-4 w-4" /> Authorities
          </Button>
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold">{report.summary.totalCategories}</div>
              <div className="text-xs text-muted-foreground">Categories</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold">{report.summary.totalFolders}</div>
              <div className="text-xs text-muted-foreground">Folders</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold text-green-600">{report.summary.vitalRecordsVerified}</div>
              <div className="text-xs text-muted-foreground">Vital Verified</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold text-amber-600">{report.summary.vitalRecordsDueReview}</div>
              <div className="text-xs text-muted-foreground">Due Review</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold">{report.summary.dispositionAuthorities}</div>
              <div className="text-xs text-muted-foreground">Authorities</div>
            </GlassCard>
          </div>

          <GlassCard className="p-6" hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                DoD 5015.02 Compliance Status
              </h2>
              <Button variant="outline" size="sm" onClick={() => window.open('/api/records/compliance-report', '_blank')}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </div>
            <div className="space-y-2">
              {report.requirements.map((req: any) => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-lg glass-card border">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10">
                      {req.implemented ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{req.id}</Badge>
                        <span className="font-medium text-sm">{req.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{req.evidence}</p>
                    </div>
                  </div>
                  {req.implemented && <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">Implemented</Badge>}
                </div>
              ))}
            </div>
          </GlassCard>
        </>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Record Categories</h2>
        <div className="space-y-2">
          {categories.length === 0 ? (
            <GlassCard className="p-8 text-center" hover={false}>
              <FolderTree className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No record categories yet.</p>
            </GlassCard>
          ) : (
            categories.map((cat: any, i: number) => (
              <motion.div key={cat.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <GlassCard className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{cat.code}</Badge>
                        <span className="font-medium">{cat.name}</span>
                        <Badge variant="secondary" className="capitalize">{cat.disposition}</Badge>
                        {cat.isVital && <Badge className="bg-red-500/10 text-red-700 dark:text-red-400">Vital</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{cat.description || 'No description'}</p>
                      {cat.retentionActiveYears != null && (
                        <p className="text-xs text-muted-foreground mt-1">Retention: {cat.retentionActiveYears} years active + {cat.retentionSemiActiveYears || 0} semi-active → {cat.dispositionAction || 'N/A'}</p>
                      )}
                    </div>
                    <div className="text-end text-xs text-muted-foreground">
                      {cat.folders?.length || 0} folders
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
''',

    "src/app/(app)/admin/records-management/folders/page.tsx": ''''use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, Folder, Scissors, Trash2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function FoldersPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['record-folders'],
    queryFn: () => api.get('/api/records/folders'),
  });

  const cutoffMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/records/folders/${id}/cutoff`),
    onSuccess: () => { toast({ title: 'Folder cut off' }); queryClient.invalidateQueries({ queryKey: ['record-folders'] }); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const disposeMutation = useMutation({
    mutationFn: ({ id, method }: { id: string; method: string }) => api.post(`/api/records/folders/${id}/dispose`, { method }),
    onSuccess: () => { toast({ title: 'Folder disposed' }); queryClient.invalidateQueries({ queryKey: ['record-folders'] }); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const folders = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/records-management')}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Folder className="h-6 w-6 text-primary" /> Record Folders</h1>
      </div>

      <div className="space-y-2">
        {folders.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}><p className="text-muted-foreground">No record folders yet.</p></GlassCard>
        ) : (
          folders.map((f: any) => (
            <GlassCard key={f.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{f.title}</span>
                    <Badge variant="outline">{f.category?.code}</Badge>
                    <Badge variant="secondary" className="capitalize">{f.status}</Badge>
                    {f.fiscalYear && <Badge variant="outline">FY{f.fiscalYear}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {f.dateRangeStart ? new Date(f.dateRangeStart).toLocaleDateString() : '—'} → {f.dateRangeEnd ? new Date(f.dateRangeEnd).toLocaleDateString() : '—'}
                    {f.eligibleForDispositionAt && <span className="ms-3">Eligible: {new Date(f.eligibleForDispositionAt).toLocaleDateString()}</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {f.status === 'open' && (
                    <Button size="sm" variant="outline" onClick={() => cutoffMutation.mutate(f.id)}><Scissors className="h-4 w-4" /> Cutoff</Button>
                  )}
                  {f.status === 'cutoff' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => disposeMutation.mutate({ id: f.id, method: 'destroyed' })}><Trash2 className="h-4 w-4" /> Destroy</Button>
                      <Button size="sm" variant="outline" onClick={() => disposeMutation.mutate({ id: f.id, method: 'transferred' })}>Transfer</Button>
                    </>
                  )}
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}
''',

    "src/app/(app)/admin/records-management/vital/page.tsx": ''''use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, ShieldCheck, ArrowLeft, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function VitalRecordsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['vital-records'],
    queryFn: () => api.get('/api/records/vital'),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/records/vital/${id}`, { verifyBackup: true }),
    onSuccess: () => { toast({ title: 'Backup verified' }); queryClient.invalidateQueries({ queryKey: ['vital-records'] }); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const records = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/records-management')}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Vital Records</h1>
      </div>

      <div className="space-y-2">
        {records.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}><p className="text-muted-foreground">No vital records designated.</p></GlassCard>
        ) : (
          records.map((v: any) => (
            <GlassCard key={v.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{v.document?.title || 'Unknown'}</span>
                    <Badge className="capitalize bg-red-500/10 text-red-700 dark:text-red-400">{v.recordType}</Badge>
                    <Badge variant="outline" className="capitalize">{v.vitalReason}</Badge>
                    <Badge variant="outline">Priority {v.recoveryPriority}</Badge>
                    {v.backupVerified ? (
                      <Badge className="bg-green-500/10 text-green-700 dark:text-green-400"><CheckCircle className="h-3 w-3 me-1" /> Verified</Badge>
                    ) : (
                      <Badge variant="destructive">Unverified</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Next review: {v.nextReviewAt ? new Date(v.nextReviewAt).toLocaleDateString() : '—'}
                    {v.lastVerifiedAt && <span className="ms-3">Last verified: {new Date(v.lastVerifiedAt).toLocaleDateString()}</span>}
                  </p>
                </div>
                {!v.backupVerified && (
                  <Button size="sm" variant="outline" onClick={() => verifyMutation.mutate(v.id)}>
                    <CheckCircle className="h-4 w-4" /> Verify Backup
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
''',

    "src/app/(app)/admin/records-management/authorities/page.tsx": ''''use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, FileCheck, ArrowLeft, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AuthoritiesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['disposition-authorities'],
    queryFn: () => api.get('/api/records/authorities'),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const authorities = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/records-management')}><ArrowLeft className="h-4 w-4" /> Back</Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FileCheck className="h-6 w-6 text-primary" /> Disposition Authorities</h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Authority</Button>
      </div>

      {showCreate && <CreateAuthorityForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['disposition-authorities'] }); }} />}

      <div className="space-y-2">
        {authorities.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}><p className="text-muted-foreground">No disposition authorities yet.</p></GlassCard>
        ) : (
          authorities.map((a: any) => (
            <GlassCard key={a.id} className="p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{a.authorityType.replace(/_/g, ' ')}</Badge>
                <Badge variant="secondary">{a.authorityNumber}</Badge>
                <span className="font-medium">{a.title}</span>
                <Badge variant="secondary" className="capitalize ms-auto">{a.status}</Badge>
              </div>
              {a.description && <p className="text-sm text-muted-foreground mt-1">{a.description}</p>}
              {a.effectiveDate && <p className="text-xs text-muted-foreground mt-1">Effective: {new Date(a.effectiveDate).toLocaleDateString()}</p>}
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}

function CreateAuthorityForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [authorityType, setAuthorityType] = useState('agency_specific');
  const [authorityNumber, setAuthorityNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(3);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/authorities', data),
    onSuccess: () => { toast({ title: 'Authority created' }); onCreated(); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">New Disposition Authority</h3>
      <div className="space-y-4">
        <select className="glass-input w-full px-3 py-2 rounded-lg" value={authorityType} onChange={e => setAuthorityType(e.target.value)}>
          <option value="agency_specific">Agency Specific</option>
          <option value="nara_grs">NARA GRS</option>
          <option value="nara_sf">NARA SF</option>
          <option value="court_order">Court Order</option>
        </select>
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Authority number (e.g., GR-2024-001)" value={authorityNumber} onChange={e => setAuthorityNumber(e.target.value)} />
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Description" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="flex items-center gap-2">
          <label className="text-sm">Active retention (years):</label>
          <input type="number" className="glass-input w-24 px-3 py-2 rounded-lg" value={active} onChange={e => setActive(Number(e.target.value))} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ authorityType, authorityNumber, title, description, retentionInstructions: { active, disposition: 'destroy' } })} disabled={!authorityNumber || !title || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
''',
}

for filepath, content in PAGES.items():
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"  ✅ {filepath}")

print(f"\n✅ {len(PAGES)} UI pages created")
