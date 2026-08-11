'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard, PremiumSkeleton, PremiumEmptyState } from '@/components/ui/premium';
import { Loader2, Folder, Scissors, Trash2, ArrowLeft, Plus, Calendar, FolderTree, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function FoldersPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['record-folders'],
    queryFn: () => api.get('/api/records/folders'),
  });

  const { data: categoriesData } = useQuery<any>({
    queryKey: ['record-categories'],
    queryFn: () => api.get('/api/records/categories'),
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

  const folders = data?.items || [];
  const categories = categoriesData?.items || [];

  const statusConfig: Record<string, { color: string; bg: string }> = {
    open: { color: 'text-green-600', bg: 'bg-green-500/10' },
    closed: { color: 'text-blue-600', bg: 'bg-blue-500/10' },
    cutoff: { color: 'text-amber-600', bg: 'bg-amber-500/10' },
    disposed: { color: 'text-gray-600', bg: 'bg-gray-500/10' },
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/records-management')}>
            <ArrowLeft className="h-4 w-4" /> {t('recordsManagement.back')}
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Folder className="h-6 w-6 text-primary" />
            {t('recordsManagement.folders')}
          </h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('recordsManagement.newFolder')}</span>
          <span className="sm:hidden">New</span>
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: folders.length, color: 'text-primary', bg: 'bg-primary/5' },
          { label: 'Open', value: folders.filter((f: any) => f.status === 'open').length, color: 'text-green-600', bg: 'bg-green-500/5' },
          { label: 'Cutoff', value: folders.filter((f: any) => f.status === 'cutoff').length, color: 'text-amber-600', bg: 'bg-amber-500/5' },
          { label: 'Disposed', value: folders.filter((f: any) => f.status === 'disposed').length, color: 'text-gray-600', bg: 'bg-gray-500/5' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <GlassCard className="p-4" hover={false}>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <CreateFolderForm categories={categories} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['record-folders'] }); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <GlassCard key={i} className="p-5" hover={false}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-2">
                    <PremiumSkeleton className="h-5 w-48" />
                    <PremiumSkeleton className="h-4 w-64" />
                    <div className="flex gap-3 mt-2"><PremiumSkeleton className="h-4 w-24" /><PremiumSkeleton className="h-4 w-24" /></div>
                  </div>
                  <PremiumSkeleton className="h-10 w-24" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : folders.length === 0 ? (
          <PremiumEmptyState icon={Folder} title={t('recordsManagement.noFolders')} />
        ) : (
          <AnimatePresence mode="popLayout">
            {folders.map((f: any, i: number) => {
              const config = statusConfig[f.status] || statusConfig.open;
              return (
                <motion.div key={f.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ delay: i * 0.05 }}>
                  <GlassCard className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <div className={`p-1.5 rounded-lg ${config.bg} shrink-0`}>
                            <Folder className={`h-4 w-4 ${config.color}`} />
                          </div>
                          <h3 className="font-semibold truncate">{f.title}</h3>
                          {f.category && <Badge variant="outline" className="shrink-0">{f.category.code}</Badge>}
                          <Badge className={`${config.bg} ${config.color} border-0 capitalize`} variant="outline">{f.status}</Badge>
                          {f.fiscalYear && <Badge variant="secondary" className="shrink-0">FY{f.fiscalYear}</Badge>}
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {f.dateRangeStart ? new Date(f.dateRangeStart).toLocaleDateString() : '—'} → {f.dateRangeEnd ? new Date(f.dateRangeEnd).toLocaleDateString() : '—'}
                          </span>
                          {f.eligibleForDispositionAt && (
                            <span className="flex items-center gap-1 text-amber-600">
                              <AlertCircle className="h-3 w-3" />
                              {t('recordsManagement.eligible')}: {new Date(f.eligibleForDispositionAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {f.status === 'open' && (
                          <Button size="sm" variant="outline" onClick={() => cutoffMutation.mutate(f.id)}>
                            <Scissors className="h-4 w-4" />
                            <span className="hidden sm:inline ms-1">{t('recordsManagement.cutoff')}</span>
                          </Button>
                        )}
                        {f.status === 'cutoff' && (
                          <>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => disposeMutation.mutate({ id: f.id, method: 'destroyed' })}>
                              <Trash2 className="h-4 w-4" />
                              <span className="hidden sm:inline ms-1">{t('recordsManagement.destroy')}</span>
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => disposeMutation.mutate({ id: f.id, method: 'transferred' })}>
                              <span className="hidden sm:inline">{t('recordsManagement.transfer')}</span>
                            </Button>
                          </>
                        )}
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

function CreateFolderForm({ categories, onClose, onCreated }: { categories: any[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/folders', data),
    onSuccess: () => { toast({ title: t('recordsManagement.folderCreated') }); onCreated(); },
    onError: (err: any) => toast({ title: t('recordsManagement.failed'), description: err?.message, variant: 'destructive' }),
  });

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!categoryId) newErrors.categoryId = 'Required';
    if (title.length < 2) newErrors.title = 'Minimum 2 characters';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    createMutation.mutate({ categoryId, title, description, fiscalYear });
  };

  return (
    <GlassCard className="p-6" hover={false}>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Plus className="h-5 w-5 text-primary" />
        {t('recordsManagement.createFolder')}
      </h3>
      <div className="space-y-4">
        <div>
          <select className={`glass-input w-full px-3 py-2 rounded-lg cursor-pointer ${errors.categoryId ? 'ring-2 ring-red-500/30' : ''}`} value={categoryId} onChange={e => { setCategoryId(e.target.value); setErrors({}); }}>
            <option value="">{t('recordsManagement.selectCategory')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          {errors.categoryId && <p className="text-xs text-red-500 mt-1">{errors.categoryId}</p>}
        </div>
        <div>
          <input className={`glass-input w-full px-3 py-2 rounded-lg ${errors.title ? 'ring-2 ring-red-500/30' : ''}`} placeholder={t('recordsManagement.folderTitle')} value={title} onChange={e => { setTitle(e.target.value); setErrors({}); }} />
          {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
        </div>
        <textarea className="glass-input w-full px-3 py-2 rounded-lg resize-none" placeholder={t('recordsManagement.descriptionOptional')} rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder={t('recordsManagement.fiscalYear')} value={fiscalYear} onChange={e => setFiscalYear(e.target.value)} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('recordsManagement.cancel')}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!categoryId || !title || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('recordsManagement.create')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
