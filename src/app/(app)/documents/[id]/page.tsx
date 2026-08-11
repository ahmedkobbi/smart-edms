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
  ShieldAlert, Copy, MessageSquare, Send, Star, ShieldCheck, FolderOpen, Square,
  RotateCcw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/i18n/use-i18n';
import { useSessionData } from '@/components/providers/use-session-data';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions.client';
import { formatDistanceToNow } from 'date-fns';
import { formatBytes, truncateHash } from '@/lib/utils/format';
import { VersionCompare } from '@/components/documents/version-compare';
import { RedactionEditor } from '@/components/documents/redaction-editor';
import { CollaborationPanel } from '@/components/documents/collaboration-panel';
import { DocumentRecordsTab } from '@/components/documents/records-tab';

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

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
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
        .catch((err: any) => toast({ title: t('documents.downloadFailedToast'), description: err?.message, variant: 'destructive' }))
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
      .catch((err: any) => toast({ title: t('documents.downloadFailedToast'), description: err?.message, variant: 'destructive' }));
  };

  const lockMutation = useMutation({
    mutationFn: (lock: boolean) =>
      lock
        ? api.post(`/api/documents/${params.id}/lock`, { reason: t('documents.manualLockReason') })
        : api.delete(`/api/documents/${params.id}/lock`),
    onSuccess: () => {
      toast({ title: t('documents.lockChangedDesc'), description: t('documents.lockChangedToast') });
      qc.invalidateQueries({ queryKey: ['document', params.id] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const aiSuggestMutation = useMutation({
    mutationFn: () => api.post(`/api/documents/${params.id}/ai-suggest`),
    onSuccess: (res: any) => {
      toast({
        title: t('documents.aiSuggestionReadyToast'),
        description: t('documents.aiSuggestionReadyToastDesc', { name: res.suggestion.name }),
      });
      qc.invalidateQueries({ queryKey: ['document', params.id] });
    },
    onError: (err: any) => toast({ title: t('documents.aiFailedToast'), description: err?.message, variant: 'destructive' }),
  });

  const classifyMutation = useMutation({
    mutationFn: (classificationId: string) =>
      api.patch(`/api/documents/${params.id}`, { classificationId, reason: t('documents.manualClassificationReason') }),
    onSuccess: () => {
      toast({ title: t('documents.classificationUpdatedToast') });
      qc.invalidateQueries({ queryKey: ['document', params.id] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const uploadVersionMutation = useMutation({
    mutationFn: async () => {
      if (!newVersionFile) throw new Error(t('documents.noFileError'));
      const fd = new FormData();
      fd.append('file', newVersionFile);
      fd.append('changeReason', changeReason || t('documents.newVersionUploadReason'));
      return uploadFile(`/api/documents/${params.id}/versions`, fd);
    },
    onSuccess: () => {
      toast({ title: t('documents.versionUploadedToast') });
      setNewVersionFile(null);
      setChangeReason('');
      qc.invalidateQueries({ queryKey: ['document', params.id] });
    },
    onError: (err: any) => toast({ title: t('documents.uploadFailedToast'), description: err?.message, variant: 'destructive' }),
  });

  // Restore a previous version (creates a new forward-only version)
  const restoreVersionMutation = useMutation({
    mutationFn: ({ versionId, reason }: { versionId: string; reason: string }) =>
      api.post(`/api/documents/${params.id}/versions/${versionId}/restore`, { reason }),
    onSuccess: () => {
      toast({ title: t('documents.versionRestoredToast'), description: t('documents.versionRestoredDesc') });
      qc.invalidateQueries({ queryKey: ['document', params.id] });
    },
    onError: (err: any) => toast({ title: t('documents.restoreFailedToast'), description: err?.message, variant: 'destructive' }),
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
          <ArrowLeft className="me-1 h-3.5 w-3.5" /> {t('documents.backToDocuments')}
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
              <Badge variant="secondary" className="text-xs">{t(`state.${doc.state}`, doc.state)}</Badge>
              {doc.isRecord && <Badge variant="outline" className="text-xs">{t('documents.recordBadge')}</Badge>}
              {doc.legalHold && (
                <Badge variant="outline" className="text-xs text-red-600 border-red-300">
                  <FileLock className="me-1 h-3 w-3" /> {t('documents.legalHoldBadge')}
                </Badge>
              )}
              {doc.isLocked && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  <Lock className="me-1 h-3 w-3" /> {t('documents.lockedBadge')}
                </Badge>
              )}
            </div>
            {doc.description && <p className="text-sm text-muted-foreground">{doc.description}</p>}
          </div>
          <div className="flex gap-2">
            {hasPermission(perms, PERMISSIONS.DOCUMENT_DOWNLOAD) && doc.downloadAllowed && (
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="me-2 h-3.5 w-3.5" /> {t('documents.download')}
              </Button>
            )}
            <FavoriteButton docId={params.id} />
            {hasPermission(perms, PERMISSIONS.DOCUMENT_DECLARE_RECORD) && !doc.isRecord && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm(t('documents.declareRecordConfirm'))) {
                    api.post(`/api/documents/${params.id}/declare-record`, { reason: t('documents.manualDeclarationReason') })
                      .then(() => { toast({ title: t('documents.recordDeclaredToast') }); qc.invalidateQueries({ queryKey: ['document', params.id] }); })
                      .catch((err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }));
                  }
                }}
              >
                <ShieldCheck className="me-2 h-3.5 w-3.5" /> {t('documents.declareRecord')}
              </Button>
            )}
            <MoveCopyDialog docId={params.id} />
            {hasPermission(perms, PERMISSIONS.DOCUMENT_LOCK) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => lockMutation.mutate(!doc.isLocked)}
                disabled={lockMutation.isPending}
              >
                {doc.isLocked ? <Unlock className="me-2 h-3.5 w-3.5" /> : <Lock className="me-2 h-3.5 w-3.5" />}
                {doc.isLocked ? t('documents.unlock') : t('documents.lock')}
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
          {t('documents.classification')}: {doc.classification.name} — {(doc.classification as any).description ?? t('documents.sensitiveDefault')}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-8 lg:w-fit">
          <TabsTrigger value="overview">{t('documents.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="preview">{t('documents.tabs.preview')}</TabsTrigger>
          <TabsTrigger value="versions">{t('documents.tabs.versions')}</TabsTrigger>
          <TabsTrigger value="comments">{t('documents.tabs.comments')}</TabsTrigger>
          <TabsTrigger value="audit">{t('documents.tabs.audit')}</TabsTrigger>
          <TabsTrigger value="share">{t('documents.tabs.share')}</TabsTrigger>
          <TabsTrigger value="collab">{t('documents.tabs.collab')}</TabsTrigger>
          <TabsTrigger value="ai">{t('documents.tabs.ai')}</TabsTrigger>
          <TabsTrigger value="records">{t('recordsManagement.filePlan')}</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t('documents.owner')}</CardTitle></CardHeader>
              <CardContent className="text-sm">{doc.owner?.name ?? doc.owner?.email ?? t('common.unknown')}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t('documents.type')}</CardTitle></CardHeader>
              <CardContent className="text-sm font-mono">{doc.documentType}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t('common.createdAt')}</CardTitle></CardHeader>
              <CardContent className="text-sm">{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</CardContent>
            </Card>
          </div>

          {latestVersion && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t('documents.currentVersionLabel', { version: latestVersion.versionNumber })}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('documents.fileName')}</p>
                    <p className="font-medium truncate">{latestVersion.fileName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('documents.fileSize')}</p>
                    <p className="font-medium">{formatBytes(latestVersion.sizeBytes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('documents.mimeType')}</p>
                    <p className="font-medium font-mono text-xs">{latestVersion.mimeType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('documents.checksum')}</p>
                    <p className="font-mono text-xs">{truncateHash(latestVersion.checksumSha256, 12, 8)}</p>
                  </div>
                </div>
                {latestVersion.changeReason && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t('documents.changeReason')}</p>
                    <p className="text-sm">{latestVersion.changeReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tags.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t('documents.tags')}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t: string) => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
              </CardContent>
            </Card>
          )}

          {Object.keys(metadata).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t('documents.metadata')}</CardTitle></CardHeader>
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
              <CardHeader><CardTitle className="text-base">{t('documents.retention')}</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="text-muted-foreground">{t('documents.scheduleLabel')}</span> {doc.retentionSchedule.name}</p>
                <p><span className="text-muted-foreground">{t('documents.retentionLabel')}</span> {doc.retentionSchedule.retentionDays} {t('documents.daysUnit')}</p>
                <p><span className="text-muted-foreground">{t('documents.dispositionLabel')}</span> {doc.retentionSchedule.dispositionAction}</p>
                {doc.retentionDisposeAfter && (
                  <p><span className="text-muted-foreground">{t('documents.disposeAfterLabel')}</span> {new Date(doc.retentionDisposeAfter).toLocaleDateString()}</p>
                )}
              </CardContent>
            </Card>
          )}

          {hasPermission(perms, PERMISSIONS.DOCUMENT_CLASSIFY) && classificationsData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('documents.classification')}</CardTitle>
                <CardDescription>{t('documents.classificationCardDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={doc.classification?.id ?? ''}
                  onValueChange={(v) => classifyMutation.mutate(v)}
                >
                  <SelectTrigger className="w-full md:w-72"><SelectValue placeholder={t('documents.selectClassification')} /></SelectTrigger>
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
          <VersionCompare docId={params.id} versions={doc.versions} />
          <Card className="glass-card border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{t('documents.versionHistory')}</CardTitle>
                <CardDescription>{t('documents.versionCount', { count: doc.versions.length })}</CardDescription>
              </div>
              {hasPermission(perms, PERMISSIONS.DOCUMENT_UPDATE) && !doc.isLocked && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <History className="me-2 h-3.5 w-3.5" /> {t('documents.uploadNewVersion')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('documents.uploadNewVersion')}</DialogTitle>
                      <DialogDescription>{t('documents.previousVersionPreserved')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <Input type="file" onChange={(e) => setNewVersionFile(e.target.files?.[0] ?? null)} />
                      <div className="space-y-1">
                        <Label htmlFor="reason">{t('documents.changeReason')}</Label>
                        <Textarea id="reason" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} rows={2} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => uploadVersionMutation.mutate()} disabled={!newVersionFile || uploadVersionMutation.isPending}>
                        {uploadVersionMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                        {t('documents.uploadButton')}
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
                        {formatBytes(v.sizeBytes)} · {v.mimeType} · {v.uploader?.name ?? v.uploader?.email ?? t('common.unknown')} · {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                      </p>
                      {v.changeReason && <p className="text-xs mt-1 italic text-muted-foreground">"{v.changeReason}"</p>}
                      <p className="text-[10px] font-mono text-muted-foreground mt-1">sha256:{truncateHash(v.checksumSha256, 16, 12)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.versionNumber !== doc.currentVersion && hasPermission(perms, PERMISSIONS.DOCUMENT_VERSION_RESTORE) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={restoreVersionMutation.isPending}
                          onClick={() => {
                            const reason = window.prompt(t('documents.restoreVersionPrompt', { version: v.versionNumber }));
                            if (reason) {
                              restoreVersionMutation.mutate({ versionId: v.id, reason });
                            }
                          }}
                        >
                          <RotateCcw className="me-1 h-3 w-3" /> {t('documents.restore')}
                        </Button>
                      )}
                      {v.versionNumber === doc.currentVersion && (
                        <Badge variant="secondary" className="text-xs">{t('documents.currentVersion')}</Badge>
                      )}
                    </div>
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
              <CardTitle className="text-base">{t('documents.auditTimelineTitle')}</CardTitle>
              <CardDescription>{t('documents.auditTimelineDesc')}</CardDescription>
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
                          {ev.actorEmail ?? t('audit.systemActor')} · {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                          {ev.reason && ` · ${ev.reason}`}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">#{ev.sequenceNum}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground">{t('documents.noAuditEvents')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Share */}
        <TabsContent value="share" className="space-y-4">
          <ShareManager docId={params.id} shares={sharesData?.shares ?? []} classifications={[]} doc={doc} />
        </TabsContent>

        {/* Collaboration */}
        <TabsContent value="collab" className="space-y-4">
          {hasPermission(perms, PERMISSIONS.DOCUMENT_UPDATE) && !doc.isLocked ? (
            <CollaborationPanel docId={params.id} tenantId={session?.user?.tenantId || ''} />
          ) : (
            <Card className="glass-card border-0">
              <CardContent className="p-6 text-center">
                <Lock className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium">
                  {doc.isLocked ? t('documents.lockedNoEdit') : t('documents.noPermissionNoEdit')}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Preview */}
        <TabsContent value="preview" className="space-y-4">
          <DocumentPreview docId={params.id} doc={doc} />
          {hasPermission(perms, PERMISSIONS.DOCUMENT_REDACT) && !doc.legalHold && (
            <RedactionEntry docId={params.id} doc={doc} />
          )}
        </TabsContent>

        {/* Comments */}
        <TabsContent value="comments" className="space-y-4">
          <CommentsPanel docId={params.id} />
        </TabsContent>

        {/* AI */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> {t('documents.aiClassificationTitle')}
              </CardTitle>
              <CardDescription>
                {t('documents.aiClassificationDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {doc.aiClassificationSuggested ? (
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p><strong>{t('documents.suggestedLabel')}</strong> {doc.aiClassificationSuggested}</p>
                      {doc.aiClassificationReason && <p className="text-sm">{doc.aiClassificationReason}</p>}
                      <p className="text-xs text-muted-foreground">{t('documents.statusLabel')} {doc.aiSuggestionState}</p>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <p className="text-sm text-muted-foreground">{t('documents.aiNoSuggestion')}</p>
              )}
              {hasPermission(perms, PERMISSIONS.AI_SUGGESTION_REQUEST) && (
                <Button variant="outline" size="sm" onClick={() => aiSuggestMutation.mutate()} disabled={aiSuggestMutation.isPending}>
                  {aiSuggestMutation.isPending ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="me-2 h-3.5 w-3.5" />}
                  {t('documents.aiRequestSuggestion')}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* PII Detection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" /> {t('documents.piiTitle')}
              </CardTitle>
              <CardDescription>{t('documents.piiDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <PiiScanner docId={params.id} />
            </CardContent>
          </Card>

          {/* Summarization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> {t('documents.summaryTitle')}
              </CardTitle>
              <CardDescription>{t('documents.summaryDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Summarizer docId={params.id} />
            </CardContent>
          </Card>

          {/* Policy Risk */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> {t('documents.policyRiskTitle')}
              </CardTitle>
              <CardDescription>{t('documents.policyRiskDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <PolicyRiskAnalyzer docId={params.id} />
            </CardContent>
          </Card>

          {/* Duplicate Detection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Copy className="h-4 w-4" /> {t('documents.duplicateTitle')}
              </CardTitle>
              <CardDescription>{t('documents.duplicateDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <DuplicateChecker docId={params.id} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Records (DoD 5015.02) */}
        <TabsContent value="records" className="space-y-4">
          <DocumentRecordsTab documentId={params.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ShareManager({ docId, shares, doc }: { docId: string; shares: any[]; doc: any; classifications: any[] }) {
  const { toast } = useToast();
  const { t } = useI18n();
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
        title: t('documents.shareCreatedToast'),
        description: t('documents.shareCreatedDesc'),
      });
      qc.invalidateQueries({ queryKey: ['document-shares', docId] });
      setRecipientEmail(''); setPassword('');
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  if (!doc.shareAllowed) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm font-medium">{t('documents.sharingDisabledTitle')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('documents.sharingDisabledDesc')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('documents.sharingTitle')}</CardTitle>
        <CardDescription>{t('documents.sharingDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t('documents.recipientEmailLabel')}</Label>
            <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder={t('documents.recipientEmailPlaceholder')} />
          </div>
          <div className="space-y-1">
            <Label>{t('documents.shareModeLabel')}</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="view">{t('documents.shareModeView')}</SelectItem>
                <SelectItem value="download">{t('documents.shareModeDownload')}</SelectItem>
                <SelectItem value="review">{t('documents.shareModeReview')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('documents.expiresInLabel')}</Label>
            <Select value={expiresInDays} onValueChange={setExpiresInDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('documents.expiresInOne')}</SelectItem>
                <SelectItem value="7">{t('documents.expiresInSeven')}</SelectItem>
                <SelectItem value="30">{t('documents.expiresInThirty')}</SelectItem>
                <SelectItem value="90">{t('documents.expiresInNinety')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('documents.passwordOptionalLabel')}</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('documents.passwordMinHint')} />
          </div>
        </div>
        <Button size="sm" onClick={() => createShare.mutate()} disabled={createShare.isPending}>
          {createShare.isPending && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
          {t('documents.createShareLink')}
        </Button>

        {shares.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-sm font-medium">{t('documents.activeSharesTitle', { count: shares.length })}</p>
            <div className="divide-y divide-slate-100 dark:divide-slate-900 border border-slate-200 dark:border-slate-800 rounded-md">
              {shares.map((s: any) => (
                <div key={s.id} className="p-3 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs truncate">{s.token.slice(0, 16)}…</p>
                    <p className="text-xs text-muted-foreground">
                      {s.recipientEmail ?? t('documents.anonymous')} · {s.mode} · expires {s.expiresAt ? formatDistanceToNow(new Date(s.expiresAt), { addSuffix: true }) : t('documents.never')} · {t('documents.viewCount', { count: s.viewCount })}
                    </p>
                  </div>
                  <a href={`/shared/${s.token}`} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm" className="text-xs">
                      <Eye className="me-1 h-3 w-3" /> {t('documents.openShare')}
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

// ---------------------------------------------------------------------------
//  Document Preview component
// ---------------------------------------------------------------------------

function DocumentPreview({ docId, doc }: { docId: string; doc: any }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [preview, setPreview] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadPreview() {
    setLoading(true);
    try {
      const res = await api.get<{ url: string; watermark: boolean; watermarkText: string | null; fileName: string; mimeType: string }>(`/api/documents/${docId}/preview`);
      setPreview(res);
    } catch (err: any) {
      toast({ title: t('documents.previewFailedToast'), description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (!doc.previewAllowed) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm font-medium">{t('documents.previewDisabledTitle')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('documents.previewDisabledDesc')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4" /> {t('documents.inBrowserPreviewTitle')}
        </CardTitle>
        <CardDescription>
          {doc.watermarkEnabled ? t('documents.watermarkEnabledDesc') : t('documents.noWatermarkDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!preview ? (
          <Button onClick={loadPreview} disabled={loading}>
            {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            <Eye className="me-2 h-4 w-4" /> {t('documents.loadPreview')}
          </Button>
        ) : (
          <div className="space-y-3">
            {preview.watermark && preview.watermarkText && (
              <Alert>
                <AlertDescription className="text-xs">
                  <strong>{t('documents.watermarkLabel')}</strong> <span className="font-mono">{preview.watermarkText}</span>
                </AlertDescription>
              </Alert>
            )}
            <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
              {preview.mimeType.startsWith('image/') ? (
                <img src={preview.url} alt={preview.fileName} className="max-w-full h-auto" />
              ) : preview.mimeType === 'application/pdf' ? (
                <iframe src={preview.url} className="w-full h-[70vh]" title={preview.fileName} />
              ) : preview.mimeType.startsWith('text/') ? (
                <iframe src={preview.url} className="w-full h-[70vh] bg-white" title={preview.fileName} />
              ) : (
                <div className="p-8 text-center">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm">{t('documents.previewNotAvailable', { mimeType: preview.mimeType })}</p>
                  <a href={preview.url} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm" className="mt-2">
                      <Download className="me-2 h-3.5 w-3.5" /> {t('documents.downloadInstead')}
                    </Button>
                  </a>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('documents.previewUrlExpiresHint')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  Comments panel
// ---------------------------------------------------------------------------

function CommentsPanel({ docId }: { docId: string }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [body, setBody] = useState('');

  const { data, isLoading } = useQuery<{ comments: any[] }>({
    queryKey: ['document-comments', docId],
    queryFn: () => api.get(`/api/documents/${docId}/comments`),
  });

  const add = useMutation({
    mutationFn: () => api.post(`/api/documents/${docId}/comments`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-comments', docId] });
      setBody('');
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => api.patch(`/api/documents/${docId}/comments/${id}`, { resolved: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-comments', docId] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> {t('documents.comments')}
        </CardTitle>
        <CardDescription>{t('documents.commentsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('documents.addCommentPlaceholder')}
            rows={2}
          />
          <Button size="sm" onClick={() => add.mutate()} disabled={!body.trim() || add.isPending} className="self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : !data?.comments?.length ? (
          <p className="text-center text-sm text-muted-foreground py-6">{t('documents.noComments')}</p>
        ) : (
          <div className="space-y-3">
            {data.comments.map((c: any) => (
              <div key={c.id} className={`p-3 rounded-md border ${c.resolvedAt ? 'opacity-60 bg-slate-50 dark:bg-slate-900' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{c.author?.name ?? c.author?.email ?? t('common.unknown')}</span>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
                  {c.resolvedAt && <Badge variant="secondary" className="text-[10px]">{t('documents.commentResolvedBadge')}</Badge>}
                </div>
                <p className="text-sm">{c.body}</p>
                {!c.resolvedAt && (
                  <Button variant="ghost" size="sm" className="mt-2 h-6 text-xs" onClick={() => resolve.mutate(c.id)}>
                    {t('documents.resolveComment')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  PII Scanner
// ---------------------------------------------------------------------------

function PiiScanner({ docId }: { docId: string }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  async function scan() {
    setLoading(true);
    try {
      const res = await api.post(`/api/documents/${docId}/analyze-pii`);
      setResult(res);
    } catch (err: any) {
      toast({ title: t('documents.scanFailedToast'), description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={scan} disabled={loading}>
        {loading ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <Shield className="me-2 h-3.5 w-3.5" />}
        {t('documents.scanForPiiButton')}
      </Button>
      {result && (
        <div className="space-y-2">
          {result.totalMatches === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{t('documents.noPiiDetected')}</AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert variant="default">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{result.totalMatches}</strong> {t('documents.piiMatchesFoundNoCount', { source: result.source })}
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {Object.entries(result.byType).map(([type, count]: any) => (
                  <div key={type} className="p-2 border border-slate-200 dark:border-slate-800 rounded">
                    <p className="text-xs text-muted-foreground">{type}</p>
                    <p className="font-semibold">{count}</p>
                  </div>
                ))}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">{t('documents.viewMaskedFindings')}</summary>
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {result.findings.slice(0, 30).map((f: any, i: number) => (
                    <div key={i} className="font-mono text-[10px] text-muted-foreground">
                      {f.type}: {f.value}
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Summarizer
// ---------------------------------------------------------------------------

function Summarizer({ docId }: { docId: string }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  async function summarize() {
    setLoading(true);
    try {
      const res = await api.post(`/api/documents/${docId}/summarize`);
      setResult(res);
    } catch (err: any) {
      toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={summarize} disabled={loading}>
        {loading ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="me-2 h-3.5 w-3.5" />}
        {t('documents.generateSummaryButton')}
      </Button>
      {result && (
        <div className="space-y-2">
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
            <p className="text-sm">{result.summary}</p>
          </div>
          {result.keyPoints?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t('documents.keyPointsLabel')}</p>
              <ul className="space-y-1">
                {result.keyPoints.map((p: string, i: number) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Badge variant="outline" className="text-xs">{t('documents.sourceBadge', { source: result.source })}</Badge>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Policy Risk Analyzer
// ---------------------------------------------------------------------------

function PolicyRiskAnalyzer({ docId }: { docId: string }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    try {
      const res = await api.post(`/api/documents/${docId}/policy-risk`);
      setResult(res);
    } catch (err: any) {
      toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const severityColor: Record<string, string> = {
    critical: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900',
    high: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900',
    medium: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900',
    low: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900',
  };

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={analyze} disabled={loading}>
        {loading ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="me-2 h-3.5 w-3.5" />}
        {t('documents.analyzeRisksButton')}
      </Button>
      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-md">
            <span className="text-sm font-medium">{t('documents.overallRiskLabel')}</span>
            <Badge variant={result.overallRisk === 'critical' || result.overallRisk === 'high' ? 'destructive' : 'secondary'} className="capitalize">
              {result.overallRisk}
            </Badge>
          </div>
          {result.risks?.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{t('documents.noRisksDetected')}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {result.risks.map((r: any, i: number) => (
                <div key={i} className={`p-3 border rounded-md ${severityColor[r.severity] || ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={r.severity === 'critical' || r.severity === 'high' ? 'destructive' : 'secondary'} className="text-xs capitalize">
                      {r.severity}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">{r.category}</span>
                  </div>
                  <p className="text-sm">{r.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">→ {r.recommendation}</p>
                </div>
              ))}
            </div>
          )}
          {result.requiresHumanReview && (
            <Alert variant="default">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t('documents.humanReviewRequired')}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Duplicate Checker
// ---------------------------------------------------------------------------

function DuplicateChecker({ docId }: { docId: string }) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery<{ exactDuplicates: any[]; nearDuplicates: any[] }>({
    queryKey: ['document-duplicates', docId],
    queryFn: () => api.get(`/api/documents/${docId}/duplicate-check`),
  });

  if (isLoading) {
    return <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>;
  }

  if (!data) return null;

  if (data.exactDuplicates.length === 0 && data.nearDuplicates.length === 0) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>{t('documents.noDuplicates')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {data.exactDuplicates.length > 0 && (
        <div>
          <p className="text-sm font-medium text-red-600 mb-2">{t('documents.exactDuplicatesTitle', { count: data.exactDuplicates.length })}</p>
          <div className="space-y-1">
            {data.exactDuplicates.map((d: any) => (
              <Link key={d.documentId} href={`/documents/${d.documentId}`} className="block p-2 border border-red-200 dark:border-red-900 rounded text-sm hover:bg-red-50 dark:hover:bg-red-950/30">
                <p className="font-medium">{d.documentTitle}</p>
                <p className="text-xs text-muted-foreground">v{d.versionNumber} · {d.classification?.code ?? t('documents.unclassified')} · {d.owner?.email}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
      {data.nearDuplicates.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-600 mb-2">{t('documents.nearDuplicatesTitle', { count: data.nearDuplicates.length })}</p>
          <div className="space-y-1">
            {data.nearDuplicates.map((d: any) => (
              <Link key={d.documentId} href={`/documents/${d.documentId}`} className="block p-2 border border-amber-200 dark:border-amber-900 rounded text-sm hover:bg-amber-50 dark:hover:bg-amber-950/30">
                <p className="font-medium">{d.documentTitle}</p>
                <p className="text-xs text-muted-foreground">v{d.versionNumber} · {t('documents.sizeDiffLabel')} {d.sizeDiff} bytes</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Favorite Button
// ---------------------------------------------------------------------------

function FavoriteButton({ docId }: { docId: string }) {
  const qc = useQueryClient();
  const { data: favorites } = useQuery<{ items: any[] }>({
    queryKey: ['me-favorites'],
    queryFn: () => api.get('/api/me/favorites'),
  });
  const isFavorited = favorites?.items?.some((d: any) => d.id === docId) ?? false;

  const toggle = useMutation({
    mutationFn: () => isFavorited ? api.delete(`/api/documents/${docId}/favorite`) : api.post(`/api/documents/${docId}/favorite`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me-favorites'] });
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
    >
      <Star className={`h-3.5 w-3.5 ${isFavorited ? 'fill-amber-400 text-amber-400' : ''}`} />
    </Button>
  );
}

// ---------------------------------------------------------------------------
//  Move / Copy Dialog
// ---------------------------------------------------------------------------

function MoveCopyDialog({ docId }: { docId: string }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'move' | 'copy'>('move');
  const [folderId, setFolderId] = useState<string>('');

  const { data: folders } = useQuery<{ items: any[] }>({
    queryKey: ['folders-root'],
    queryFn: () => api.get('/api/folders'),
    enabled: open,
  });

  const execute = useMutation({
    mutationFn: () => {
      if (mode === 'move') {
        return api.post(`/api/documents/${docId}/move`, { folderId: folderId || null });
      } else {
        return api.post(`/api/documents/${docId}/copy`, { folderId: folderId || null });
      }
    },
    onSuccess: () => {
      toast({ title: mode === 'move' ? t('documents.movedToast') : t('documents.copiedToast') });
      qc.invalidateQueries({ queryKey: ['document', docId] });
      setOpen(false);
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FolderOpen className="me-2 h-3.5 w-3.5" /> {t('documents.moveCopy')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('documents.moveCopyDialogTitle')}</DialogTitle>
          <DialogDescription>{t('documents.moveCopyDialogDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <Button
              variant={mode === 'move' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('move')}
              className="flex-1"
            >
              {t('documents.moveButton')}
            </Button>
            <Button
              variant={mode === 'copy' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('copy')}
              className="flex-1"
            >
              {t('documents.copyButton')}
            </Button>
          </div>
          <div className="space-y-1">
            <Label>{t('documents.destinationFolderLabel')}</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger><SelectValue placeholder={t('documents.rootNoFolder')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('documents.rootNoFolder')}</SelectItem>
                {folders?.items?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => execute.mutate()} disabled={execute.isPending}>
            {execute.isPending && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
            {mode === 'move' ? t('documents.moveButton') : t('documents.copyButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
//  Redaction Entry (triggers RedactionEditor)
// ---------------------------------------------------------------------------

function RedactionEntry({ docId, doc }: { docId: string; doc: any }) {
  const [editing, setEditing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  async function startRedaction() {
    setLoading(true);
    try {
      const res = await api.get<{ url: string; mimeType: string }>(`/api/documents/${docId}/preview`);
      setPreviewUrl(res.url);
      setEditing(true);
    } catch (err: any) {
      toast({ title: t('documents.previewLoadFailedToast'), description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (editing && previewUrl) {
    const latestVersion = doc.versions?.[0];
    return (
      <RedactionEditor
        docId={docId}
        previewUrl={previewUrl}
        mimeType={latestVersion?.mimeType || 'application/octet-stream'}
        onClose={() => { setEditing(false); setPreviewUrl(null); }}
      />
    );
  }

  return (
    <Card className="glass-card border-0">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t('documents.redactSensitiveTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('documents.redactSensitiveDesc')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={startRedaction} disabled={loading || !doc.previewAllowed}>
          {loading ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <Square className="me-2 h-3.5 w-3.5" />}
          {t('documents.startRedactionButton')}
        </Button>
      </CardContent>
    </Card>
  );
}
