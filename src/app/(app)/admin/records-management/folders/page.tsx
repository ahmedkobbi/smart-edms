'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, Folder, Scissors, Trash2, ArrowLeft, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/i18n/use-i18n';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function FoldersPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: categoriesData } = useQuery<any>({
    queryKey: ['record-categories'],
    queryFn: () => api.get('/api/records/categories'),
  });
  const categories = categoriesData?.items || [];

  const { data, isLoading } = useQuery<any>({
    queryKey: ['record-folders'],
    queryFn: () => api.get('/api/records/folders'),
  });

  const cutoffMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/records/folders/${id}/cutoff`),
    onSuccess: () => { toast({ title: t('recordsManagement.folderCutoff') }); queryClient.invalidateQueries({ queryKey: ['record-folders'] }); },
    onError: (err: any) => toast({ title: t('recordsManagement.failed'), description: err?.message, variant: 'destructive' }),
  });

  const disposeMutation = useMutation({
    mutationFn: ({ id, method }: { id: string; method: string }) => api.post(`/api/records/folders/${id}/dispose`, { method }),
    onSuccess: () => { toast({ title: t('recordsManagement.folderDisposed') }); queryClient.invalidateQueries({ queryKey: ['record-folders'] }); },
    onError: (err: any) => toast({ title: t('recordsManagement.failed'), description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const folders = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/records-management')}><ArrowLeft className="h-4 w-4" /> {t('recordsManagement.back')}</Button>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Folder className="h-6 w-6 text-primary" /> {t('recordsManagement.title')}</h1>
      </div>

      {showCreate && <CreateFolderForm categories={categories} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['record-folders'] }); }} />}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> {t('recordsManagement.newFolder')}</Button>
      </div>

      <div className="space-y-2">
        {folders.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}><p className="text-muted-foreground">{t('recordsManagement.noFolders')}</p></GlassCard>
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
                    {f.eligibleForDispositionAt && <span className="ms-3">{t('recordsManagement.eligible')}: {new Date(f.eligibleForDispositionAt).toLocaleDateString()}</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {f.status === 'open' && (
                    <Button size="sm" variant="outline" onClick={() => cutoffMutation.mutate(f.id)}><Scissors className="h-4 w-4" /> {t('recordsManagement.cutoff')}</Button>
                  )}
                  {f.status === 'cutoff' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => disposeMutation.mutate({ id: f.id, method: 'destroyed' })}><Trash2 className="h-4 w-4" /> {t('recordsManagement.destroy')}</Button>
                      <Button size="sm" variant="outline" onClick={() => disposeMutation.mutate({ id: f.id, method: 'transferred' })}>{t('recordsManagement.transfer')}</Button>
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


function CreateFolderForm({ categories, onClose, onCreated }: { categories: any[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/folders', data),
    onSuccess: () => { toast({ title: t('recordsManagement.folderCreated') }); onCreated(); },
    onError: (err: any) => toast({ title: t('recordsManagement.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">{t('recordsManagement.createFolder')}</h3>
      <div className="space-y-4">
        <select className="glass-input w-full px-3 py-2 rounded-lg" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">{t('recordsManagement.selectCategory')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder={t('recordsManagement.folderTitle')} value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Description (optional)" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="{t('recordsManagement.fiscalYear')}" value={fiscalYear} onChange={e => setFiscalYear(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>{t('recordsManagement.cancel')}</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ categoryId, title, description, fiscalYear })} disabled={!categoryId || !title || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('recordsManagement.create')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
