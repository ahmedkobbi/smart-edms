'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { FolderOpen, Loader2, Plus, ChevronRight, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/i18n/use-i18n';

export default function FoldersPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['folders', currentFolder],
    queryFn: () => api.get(`/api/folders?parentId=${currentFolder ?? ''}`),
  });

  const { data: documents } = useQuery<{ items: any[] }>({
    queryKey: ['folder-documents', currentFolder],
    queryFn: () => api.get(`/api/documents?folderId=${currentFolder ?? ''}&pageSize=50`),
    enabled: !!currentFolder,
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/folders', { ...form, parentId: currentFolder ?? undefined }),
    onSuccess: () => {
      toast({ title: 'Folder created' });
      qc.invalidateQueries({ queryKey: ['folders'] });
      setCreateOpen(false);
      setForm({ name: '', description: '' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/folders/${id}`),
    onSuccess: () => {
      toast({ title: 'Folder deleted' });
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.folders')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize documents into a folder hierarchy.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> New folder</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create folder</DialogTitle>
              <DialogDescription>
                {currentFolder ? 'Subfolder of current location' : 'Top-level folder'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            {currentFolder ? 'Subfolders' : 'Root folders'}
          </CardTitle>
          <CardDescription>
            {currentFolder && (
              <button onClick={() => setCurrentFolder(null)} className="text-blue-600 hover:underline">
                ← Back to root
              </button>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No folders here. Create one to organize your documents.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((f) => (
                <div key={f.id} className="p-4 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                  <FolderOpen className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setCurrentFolder(f.id)}
                      className="font-medium hover:underline text-start"
                    >
                      {f.name}
                    </button>
                    {f.description && <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{f._count?.documents ?? 0} doc(s)</Badge>
                      <Badge variant="outline" className="text-xs">{f._count?.children ?? 0} subfolder(s)</Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => del.mutate(f.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {currentFolder && documents?.items && documents.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents in this folder</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {documents.items.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="block p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: doc.classification?.color || '#94a3b8' }}
                    />
                    <span className="text-sm font-medium truncate flex-1">{doc.title}</span>
                    <Badge variant="outline" className="text-xs">{doc.state}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
