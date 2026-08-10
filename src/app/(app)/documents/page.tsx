'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { api, uploadFile } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Upload, Search, Filter, Loader2, Download, Eye, MoreVertical, FileLock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { formatBytes } from '@/lib/utils/format';
import { useI18n } from '@/i18n/use-i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DocumentItem {
  id: string;
  title: string;
  description: string | null;
  state: string;
  documentType: string;
  classification: { id: string; code: string; name: string; color: string } | null;
  owner: { id: string; name: string | null; email: string } | null;
  currentVersion: number;
  legalHold: boolean;
  isRecord: boolean;
  updatedAt: string;
  _count: { versions: number; shares: number };
}

interface ListResponse {
  items: DocumentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const STATE_LABELS: Record<string, string> = {
  draft: 'Draft', active: 'Active', record: 'Record', archived: 'Archived', disposed: 'Disposed',
};

export default function DocumentsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [classificationId, setClassificationId] = useState<string>('all');
  const [state, setState] = useState<string>('all');
  const [uploadOpen, setUploadOpen] = useState(false);

  const triggerUpload = search.get('action') === 'upload';

  const { data: classifications } = useQuery<{ items: any[] }>({
    queryKey: ['classifications'],
    queryFn: () => api.get('/api/classifications'),
  });

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set('search', query);
    if (classificationId !== 'all') p.set('classificationId', classificationId);
    if (state !== 'all') p.set('state', state);
    p.set('page', String(page));
    p.set('pageSize', '20');
    return p.toString();
  }, [query, classificationId, state, page]);

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['documents', queryParams],
    queryFn: () => api.get(`/api/documents?${queryParams}`),
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('documents.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('documents.subtitle')}
          </p>
        </div>
        <UploadDialog
          open={uploadOpen || triggerUpload}
          onOpenChange={(v) => { setUploadOpen(v); if (!v && triggerUpload) router.replace('/documents'); }}
          classifications={classifications?.items ?? []}
        />
      </div>

      <Card className="glass-card border-0">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('documents.title') + '…'}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={classificationId} onValueChange={(v) => { setClassificationId(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-48">
                <Filter className="mr-2 h-3.5 w-3.5" />
                <SelectValue placeholder="Classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classifications</SelectItem>
                {classifications?.items.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={state} onValueChange={(v) => { setState(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {Object.entries(STATE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-0">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : !data?.items?.length ? (
            <div className="p-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">{t('documents.noDocuments')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try adjusting filters or upload a new document.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((doc) => (
                <div key={doc.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-1 rounded-full flex-shrink-0"
                      style={{ backgroundColor: doc.classification?.color || '#94a3b8' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/documents/${doc.id}`} className="font-medium hover:underline">
                          {doc.title}
                        </Link>
                        {doc.classification && (
                          <Badge variant="outline" className="text-xs font-mono" style={{ borderColor: doc.classification.color, color: doc.classification.color }}>
                            {doc.classification.code}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">{STATE_LABELS[doc.state] ?? doc.state}</Badge>
                        {doc.isRecord && (
                          <Badge variant="outline" className="text-xs">Record</Badge>
                        )}
                        {doc.legalHold && (
                          <Badge variant="outline" className="text-xs text-red-600 border-red-300 dark:border-red-700">
                            <FileLock className="mr-1 h-3 w-3" /> Legal hold
                          </Badge>
                        )}
                      </div>
                      {doc.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{doc.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>v{doc.currentVersion}</span>
                        <span>·</span>
                        <span>{doc._count.versions} version{doc._count.versions !== 1 ? 's' : ''}</span>
                        {doc._count.shares > 0 && (
                          <>
                            <span>·</span>
                            <span>{doc._count.shares} share{doc._count.shares !== 1 ? 's' : ''}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{doc.owner?.name ?? doc.owner?.email ?? 'Unknown'}</span>
                        <span>·</span>
                        <span>Updated {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/documents/${doc.id}`)}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> View details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/documents/${doc.id}?action=download`)}>
                          <Download className="mr-2 h-3.5 w-3.5" /> Download
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {data.page} of {data.totalPages} · {data.total} documents
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadDialog({
  open, onOpenChange, classifications,
}: { open: boolean; onOpenChange: (v: boolean) => void; classifications: any[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState('generic');
  const [classificationId, setClassificationId] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title || file.name);
      if (description) fd.append('description', description);
      fd.append('documentType', documentType);
      if (classificationId) fd.append('classificationId', classificationId);
      if (tags) fd.append('tags', tags);
      return uploadFile('/api/documents', fd);
    },
    onSuccess: () => {
      toast({ title: 'Document uploaded', description: 'Version 1 stored successfully.' });
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
      reset();
    },
    onError: (err: any) => {
      toast({ title: 'Upload failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    },
  });

  function reset() {
    setFile(null); setTitle(''); setDescription(''); setDocumentType('generic');
    setClassificationId(''); setTags(''); setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Upload document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Files are validated by magic bytes, checksummed (SHA-256), and stored encrypted at rest.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="file">File *</Label>
            <Input
              id="file"
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (!title && f) setTitle(f.name);
              }}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {formatBytes(file.size)} · {file.type || 'unknown type'}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="documentType">Document type</Label>
              <Input id="documentType" value={documentType} onChange={(e) => setDocumentType(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Classification</Label>
              <Select value={classificationId} onValueChange={setClassificationId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {classifications.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="contract, q4, finance" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
            {upload.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
