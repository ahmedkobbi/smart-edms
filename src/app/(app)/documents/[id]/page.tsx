'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, uploadFile } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft, Download, Lock, Unlock, FileLock, Shield, History, Share2, Sparkles,
  Loader2, Eye, FileText, CheckCircle2, XCircle, AlertTriangle, Clock,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSessionData } from '@/components/providers/use-session-data';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions.client';
import { formatDistanceToNow } from 'date-fns';
import { formatBytes, truncateHash } from '@/lib/utils/format';

interface DocDetail {
  document: {
    id: string;
    title: string;
    description: string | null;
    state: string;
    documentType: string;
    classification: { id: string; code: string; name: string; color: string; level: number } | null;
    owner: { id: string; name: string | null; email: string } | null;
    currentVersion: number;
    isLocked: boolean;
    lockedBy: string | null;
    lockedReason: string | null;
    lockedUntil: string | null;
    legalHold: boolean;
    legalHoldReason: string | null;
    isRecord: boolean;
    shareAllowed: boolean;
    downloadAllowed: boolean;
    watermarkEnabled: boolean;
    aiClassificationSuggested: string | null;
    aiClassificationReason: string | null;
    aiSuggestionState: string | null;
    tags: string;
    metadata: string;
    retentionSchedule: { id: string; name: string; retentionDays: number; dispositionAction: string } | null;
    retentionDisposeAfter: string | null;
    createdAt: string;
    updatedAt: string;
    versions: any[];
    _count: { shares: number; auditEvents: number; approvals: number };
  };
}

const STATE_LABELS: Record<string, string> = {
  draft: 'Draft', active: 'Active', record: 'Record', archived: 'Archived', disposed: 'Disposed',
};

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { session } = useSessionData();
  const perms = session?.user?.permissions ?? [];
  const [activeTab, setActiveTab] = useState('overview');
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);
  const [changeReason, setChangeReason] = useState('');

  useEffect(() => {
    if (search.get('action') === 'download') {
      api.get<{ url: string }>(`/api/documents/${params.id}/download`)
        .then((res) => window.open(res.url, '_blank'))
        .catch((err: any) => toast({ title: 'Download failed', description: err?.message, variant: 'destructive' }))
        .finally(() => router.replace(`/documents/${params.id}`));
    }
  }, [search, params.id, router, toast]);

  const { data, isLoading } = useQuery<DocDetail>({
    queryKey: ['document', params.id],
    queryFn: () => api.get(`/api/documents/${params.id}`),
    refetchInterval: 30_000,
  });

  const { data: auditData } = useQuery<{ events: any[] }>({
    queryKey: ['document-audit', params.id],
    queryFn: () => api.get(`/api/documents/${params.id}/audit`),
  });

  const { data: sharesData } = useQuery<{ shares: any[] }>({
    queryKey: ['document-shares', params.id],
    queryFn: () => api.get(`/api/documents/${params.id}/share`),
  });

  const { data: classificationsData } = useQuery<{ items: any[] }>({
    queryKey: ['classifications'],
    queryFn: () => api.get('/api/classifications'),
  });

  const handleDownload = () => {
    api.get<{ url: string }>(`/api/documents/${params.id}/download`)
      .then((res) => window.open(res.url, '_blank'))
      .catch((err: any) => toast({ title: 'Download failed', description: err?.message, variant: 'destructive' }));
  };

  const lockMutation = useMutation({
    mutationFn: (lock: boolean) =>
      lock
        ? api.post(`/api/documents/${params.id}/lock`, { reason: 'Manual lock' })
        : api.delete(`/api/documents/${params.id}/lock`),
    onSuccess: () => {
      toast({ title: 'Updated', description: 'Lock state changed' });
      qc.invalidateQueries({ queryKey: ['document', params.id] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const aiSuggestMutation = useMutation({
    mutationFn: () => api.post(`/api/documents/${params.id}/ai-suggest`),
    onSuccess: (res: any) => {
      toast({
        title: 'AI suggestion ready',
        description: `Suggested: ${res.suggestion.name}. Review and approve to apply.`,
      });
      qc.invalidateQueries({ queryKey: ['document', params.id] });
    },
    onError: (err: any) => toast({ title: 'AI failed', description: err?.message, variant: 'destructive' }),
  });

  const classifyMutation = useMutation({
    mutationFn: (classificationId: string) =>
      api.patch(`/api/documents/${params.id}`, { classificationId, reason: 'Manual classification' }),
    onSuccess: () => {
      toast({ title: 'Classification updated' });
      qc.invalidateQueries({ queryKey: ['document', params.id] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const uploadVersionMutation = useMutation({
    mutationFn: async () => {
      if (!newVersionFile) throw new Error('No file');
      const fd = new FormData();
      fd.append('file', newVersionFile);
      fd.append('changeReason', changeReason || 'New version upload');
      return uploadFile(`/api/documents/${params.id}/versions`, fd);
    },
    onSuccess: () => {
      toast({ title: 'Version uploaded' });
      setNewVersionFile(null);
      setChangeReason('');
      qc.invalidateQueries({ queryKey: ['document', params.id] });
    },
    onError: (err: any) => toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const doc = data.document;
  const latestVersion = doc.versions[0];
  const tags = safeParseArray(doc.tags);
  const metadata = safeParseObject(doc.metadata);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <Link href="/documents" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to documents
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
              {doc.classification && (
                <Badge variant="outline" className="font-mono text-xs" style={{ borderColor: doc.classification.color, color: doc.classification.color }}>
                  {doc.classification.code}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">{STATE_LABELS[doc.state] ?? doc.state}</Badge>
              {doc.isRecord && <Badge variant="outline" className="text-xs">Record</Badge>}
              {doc.legalHold && (
                <Badge variant="outline" className="text-xs text-red-600 border-red-300">
                  <FileLock className="mr-1 h-3 w-3" /> Legal hold
                </Badge>
              )}
              {doc.isLocked && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  <Lock className="mr-1 h-3 w-3" /> Locked
                </Badge>
              )}
            </div>
            {doc.description && <p className="text-sm text-muted-foreground">{doc.description}</p>}
          </div>
          <div className="flex gap-2">
            {hasPermission(perms, PERMISSIONS.DOCUMENT_DOWNLOAD) && doc.downloadAllowed && (
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-2 h-3.5 w-3.5" /> Download
              </Button>
            )}
            {hasPermission(perms, PERMISSIONS.DOCUMENT_LOCK) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => lockMutation.mutate(!doc.isLocked)}
                disabled={lockMutation.isPending}
              >
                {doc.isLocked ? <Unlock className="mr-2 h-3.5 w-3.5" /> : <Lock className="mr-2 h-3.5 w-3.5" />}
                {doc.isLocked ? 'Unlock' : 'Lock'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Classification banner */}
      {doc.classification && (
        <div
          className="px-4 py-2 rounded-md text-sm font-medium text-white flex items-center gap-2"
          style={{ backgroundColor: doc.classification.color }}
        >
          <Shield className="h-4 w-4" />
          Classification: {doc.classification.name} — {doc.classification.description ?? 'Sensitive document'}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 lg:w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="share">Share</TabsTrigger>
          <TabsTrigger value="ai">AI Assist</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Owner</CardTitle></CardHeader>
              <CardContent className="text-sm">{doc.owner?.name ?? doc.owner?.email ?? 'Unknown'}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Type</CardTitle></CardHeader>
              <CardContent className="text-sm font-mono">{doc.documentType}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Created</CardTitle></CardHeader>
              <CardContent className="text-sm">{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</CardContent>
            </Card>
          </div>

          {latestVersion && (
            <Card>
              <CardHeader><CardTitle className="text-base">Current version (v{latestVersion.versionNumber})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">File name</p>
                    <p className="font-medium truncate">{latestVersion.fileName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Size</p>
                    <p className="font-medium">{formatBytes(latestVersion.sizeBytes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">MIME type</p>
                    <p className="font-medium font-mono text-xs">{latestVersion.mimeType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SHA-256</p>
                    <p className="font-mono text-xs">{truncateHash(latestVersion.checksumSha256, 12, 8)}</p>
                  </div>
                </div>
                {latestVersion.changeReason && (
                  <div>
                    <p className="text-xs text-muted-foreground">Change reason</p>
                    <p className="text-sm">{latestVersion.changeReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tags.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Tags</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t: string) => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
              </CardContent>
            </Card>
          )}

          {Object.keys(metadata).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {Object.entries(metadata).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="font-medium">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          {doc.retentionSchedule && (
            <Card>
              <CardHeader><CardTitle className="text-base">Retention</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Schedule:</span> {doc.retentionSchedule.name}</p>
                <p><span className="text-muted-foreground">Retention:</span> {doc.retentionSchedule.retentionDays} days</p>
                <p><span className="text-muted-foreground">Disposition:</span> {doc.retentionSchedule.dispositionAction}</p>
                {doc.retentionDisposeAfter && (
                  <p><span className="text-muted-foreground">Dispose after:</span> {new Date(doc.retentionDisposeAfter).toLocaleDateString()}</p>
                )}
              </CardContent>
            </Card>
          )}

          {hasPermission(perms, PERMISSIONS.DOCUMENT_CLASSIFY) && classificationsData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Classification</CardTitle>
                <CardDescription>Change with audit; downgrades require elevated permission and are blocked under legal hold.</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={doc.classification?.id ?? ''}
                  onValueChange={(v) => classifyMutation.mutate(v)}
                >
                  <SelectTrigger className="w-full md:w-72"><SelectValue placeholder="Select classification" /></SelectTrigger>
                  <SelectContent>
                    {classificationsData.items.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Versions */}
        <TabsContent value="versions" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Version history</CardTitle>
                <CardDescription>{doc.versions.length} version(s)</CardDescription>
              </div>
              {hasPermission(perms, PERMISSIONS.DOCUMENT_UPDATE) && !doc.isLocked && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <History className="mr-2 h-3.5 w-3.5" /> Upload new version
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload new version</DialogTitle>
                      <DialogDescription>The previous version is preserved immutably.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <Input type="file" onChange={(e) => setNewVersionFile(e.target.files?.[0] ?? null)} />
                      <div className="space-y-1">
                        <Label htmlFor="reason">Change reason</Label>
                        <Textarea id="reason" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} rows={2} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => uploadVersionMutation.mutate()} disabled={!newVersionFile || uploadVersionMutation.isPending}>
                        {uploadVersionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Upload
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-900">
                {doc.versions.map((v: any) => (
                  <div key={v.id} className="p-4 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-xs font-medium">
                      v{v.versionNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(v.sizeBytes)} · {v.mimeType} · {v.uploader?.name ?? v.uploader?.email ?? 'Unknown'} · {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                      </p>
                      {v.changeReason && <p className="text-xs mt-1 italic text-muted-foreground">"{v.changeReason}"</p>}
                      <p className="text-[10px] font-mono text-muted-foreground mt-1">sha256:{truncateHash(v.checksumSha256, 16, 12)}</p>
                    </div>
                    {v.versionNumber === doc.currentVersion && (
                      <Badge variant="secondary" className="text-xs">Current</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit timeline</CardTitle>
              <CardDescription>Tamper-evident, hash-chained events for this document.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {auditData?.events?.length ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-900">
                  {auditData.events.map((ev: any) => (
                    <div key={ev.id} className="p-3 flex items-start gap-3 text-sm">
                      <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                        ev.result === 'allow' ? 'bg-emerald-500' : ev.result === 'deny' ? 'bg-red-500' : 'bg-amber-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs">{ev.eventType}</p>
                        <p className="text-xs text-muted-foreground">
                          {ev.actorEmail ?? 'system'} · {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                          {ev.reason && ` · ${ev.reason}`}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">#{ev.sequenceNum}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground">No audit events yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Share */}
        <TabsContent value="share" className="space-y-4">
          <ShareManager docId={params.id} shares={sharesData?.shares ?? []} classifications={[]} doc={doc} />
        </TabsContent>

        {/* AI */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI-assisted classification
              </CardTitle>
              <CardDescription>
                AI suggestions are advisory only. Applying them requires human approval.
                AI never performs downgrades, deletions, or legal-hold changes silently.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {doc.aiClassificationSuggested ? (
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p><strong>Suggested:</strong> {doc.aiClassificationSuggested}</p>
                      {doc.aiClassificationReason && <p className="text-sm">{doc.aiClassificationReason}</p>}
                      <p className="text-xs text-muted-foreground">Status: {doc.aiSuggestionState}</p>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <p className="text-sm text-muted-foreground">No AI suggestion yet. Click below to request one.</p>
              )}
              {hasPermission(perms, PERMISSIONS.AI_SUGGESTION_REQUEST) && (
                <Button variant="outline" size="sm" onClick={() => aiSuggestMutation.mutate()} disabled={aiSuggestMutation.isPending}>
                  {aiSuggestMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                  Request suggestion
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ShareManager({ docId, shares, doc }: { docId: string; shares: any[]; doc: any; classifications: any[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [mode, setMode] = useState('view');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [password, setPassword] = useState('');
  const [watermark, setWatermark] = useState(true);

  const createShare = useMutation({
    mutationFn: () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays, 10));
      return api.post(`/api/documents/${docId}/share`, {
        recipientEmail: recipientEmail || undefined,
        mode,
        expiresAt: expiresAt.toISOString(),
        password: password || undefined,
        watermark,
      });
    },
    onSuccess: (res: any) => {
      toast({
        title: 'Share link created',
        description: 'The link has been generated and audit-logged.',
      });
      qc.invalidateQueries({ queryKey: ['document-shares', docId] });
      setRecipientEmail(''); setPassword('');
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (!doc.shareAllowed) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm font-medium">Sharing is disabled for this document</p>
          <p className="text-xs text-muted-foreground mt-1">
            This is enforced by classification policy or document settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sharing</CardTitle>
        <CardDescription>Create time-limited, optionally password-protected share links.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Recipient email (optional)</Label>
            <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="recipient@example.com" />
          </div>
          <div className="space-y-1">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View only</SelectItem>
                <SelectItem value="download">View + download</SelectItem>
                <SelectItem value="review">Review workflow</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Expires in</Label>
            <Select value={expiresInDays} onValueChange={setExpiresInDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Password (optional)</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars" />
          </div>
        </div>
        <Button size="sm" onClick={() => createShare.mutate()} disabled={createShare.isPending}>
          {createShare.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Create share link
        </Button>

        {shares.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-sm font-medium">Active shares ({shares.length})</p>
            <div className="divide-y divide-slate-100 dark:divide-slate-900 border border-slate-200 dark:border-slate-800 rounded-md">
              {shares.map((s: any) => (
                <div key={s.id} className="p-3 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs truncate">{s.token.slice(0, 16)}…</p>
                    <p className="text-xs text-muted-foreground">
                      {s.recipientEmail ?? 'Anonymous'} · {s.mode} · expires {s.expiresAt ? formatDistanceToNow(new Date(s.expiresAt), { addSuffix: true }) : 'never'} · {s.viewCount} view(s)
                    </p>
                  </div>
                  <a href={`/shared/${s.token}`} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm" className="text-xs">
                      <Eye className="mr-1 h-3 w-3" /> Open
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function safeParseArray(s: string | null | undefined): any[] {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
function safeParseObject(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {};
  try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
