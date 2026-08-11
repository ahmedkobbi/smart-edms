'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard, PremiumSkeleton, PremiumEmptyState } from '@/components/ui/premium';
import { Loader2, ShieldCheck, ArrowLeft, CheckCircle, Plus, Calendar, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VitalRecordsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['vital-records'],
    queryFn: () => api.get('/api/records/vital'),
  });

  const { data: categoriesData } = useQuery<any>({
    queryKey: ['record-categories'],
    queryFn: () => api.get('/api/records/categories'),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/records/vital/${id}`, { verifyBackup: true }),
    onSuccess: () => { toast({ title: t('recordsManagement.backupVerified') }); queryClient.invalidateQueries({ queryKey: ['vital-records'] }); },
    onError: (err: any) => toast({ title: t('recordsManagement.failed'), description: err?.message, variant: 'destructive' }),
  });

  const records = data?.items || [];
  const categories = categoriesData?.items || [];

  const typeConfig: Record<string, { color: string; bg: string }> = {
    essential: { color: 'text-red-600', bg: 'bg-red-500/10' },
    important: { color: 'text-amber-600', bg: 'bg-amber-500/10' },
    useful: { color: 'text-blue-600', bg: 'bg-blue-500/10' },
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
            <ShieldCheck className="h-6 w-6 text-primary" />
            {t('recordsManagement.vitalRecords')}
          </h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('recordsManagement.designateVital')}</span>
          <span className="sm:hidden">New</span>
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Total', value: records.length, color: 'text-primary', bg: 'bg-primary/5' },
          { label: 'Verified', value: records.filter((r: any) => r.backupVerified).length, color: 'text-green-600', bg: 'bg-green-500/5' },
          { label: 'Due Review', value: records.filter((r: any) => r.nextReviewAt && new Date(r.nextReviewAt) < new Date()).length, color: 'text-amber-600', bg: 'bg-amber-500/5' },
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
            <DesignateVitalForm categories={categories} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['vital-records'] }); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <GlassCard key={i} className="p-5" hover={false}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2"><PremiumSkeleton className="h-5 w-40" /><PremiumSkeleton className="h-6 w-24" /></div>
                    <PremiumSkeleton className="h-4 w-32" />
                    <PremiumSkeleton className="h-4 w-48" />
                  </div>
                  <PremiumSkeleton className="h-10 w-28" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : records.length === 0 ? (
          <PremiumEmptyState icon={ShieldCheck} title={t('recordsManagement.noVitalRecords')} />
        ) : (
          <AnimatePresence mode="popLayout">
            {records.map((v: any, i: number) => {
              const config = typeConfig[v.recordType] || typeConfig.important;
              const isOverdue = v.nextReviewAt && new Date(v.nextReviewAt) < new Date();
              return (
                <motion.div key={v.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ delay: i * 0.05 }}>
                  <GlassCard className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <div className={`p-1.5 rounded-lg ${config.bg} shrink-0`}>
                            <ShieldCheck className={`h-4 w-4 ${config.color}`} />
                          </div>
                          <span className="font-semibold truncate">{v.document?.title || 'Unknown'}</span>
                          <Badge className={`${config.bg} ${config.color} border-0 capitalize`} variant="outline">{v.recordType}</Badge>
                          <Badge variant="outline" className="capitalize shrink-0">{v.vitalReason}</Badge>
                          <Badge variant="outline" className="shrink-0">P{v.recoveryPriority}</Badge>
                          {v.backupVerified ? (
                            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-0">
                              <CheckCircle className="h-3 w-3 me-1" /> {t('recordsManagement.verified')}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">{t('recordsManagement.unverified')}</Badge>
                          )}
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span className={`flex items-center gap-1 ${isOverdue ? 'text-amber-600' : ''}`}>
                            {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                            {t('recordsManagement.nextReview')}: {v.nextReviewAt ? new Date(v.nextReviewAt).toLocaleDateString() : '—'}
                          </span>
                          {v.lastVerifiedAt && (
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {t('recordsManagement.lastVerified')}: {new Date(v.lastVerifiedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {!v.backupVerified && (
                        <Button size="sm" variant="outline" onClick={() => verifyMutation.mutate(v.id)} className="shrink-0">
                          <CheckCircle className="h-4 w-4" />
                          <span className="hidden sm:inline ms-1">{t('recordsManagement.verifyBackup')}</span>
                        </Button>
                      )}
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

function DesignateVitalForm({ categories, onClose, onCreated }: { categories: any[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [documentId, setDocumentId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [vitalReason, setVitalReason] = useState('operational');
  const [recordType, setRecordType] = useState('important');
  const [recoveryPriority, setRecoveryPriority] = useState(3);
  const [reviewCycleMonths, setReviewCycleMonths] = useState(12);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/vital', data),
    onSuccess: () => { toast({ title: t('recordsManagement.vitalDesignated') }); onCreated(); },
    onError: (err: any) => toast({ title: t('recordsManagement.failed'), description: err?.message, variant: 'destructive' }),
  });

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!documentId) newErrors.documentId = 'Required';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    createMutation.mutate({ documentId, categoryId: categoryId || undefined, vitalReason, recordType, recoveryPriority, reviewCycleMonths, notes });
  };

  return (
    <GlassCard className="p-6" hover={false}>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Plus className="h-5 w-5 text-primary" />
        {t('recordsManagement.designateVital')}
      </h3>
      <div className="space-y-4">
        <div>
          <input className={`glass-input w-full px-3 py-2 rounded-lg ${errors.documentId ? 'ring-2 ring-red-500/30' : ''}`} placeholder={t('recordsManagement.documentId')} value={documentId} onChange={e => { setDocumentId(e.target.value); setErrors({}); }} />
          {errors.documentId && <p className="text-xs text-red-500 mt-1">{errors.documentId}</p>}
        </div>
        <select className="glass-input w-full px-3 py-2 rounded-lg cursor-pointer" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">{t('recordsManagement.selectCategoryOptional')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select className="glass-input px-3 py-2 rounded-lg cursor-pointer" value={vitalReason} onChange={e => setVitalReason(e.target.value)}>
            <option value="operational">{t('recordsManagement.operational')}</option>
            <option value="legal">{t('recordsManagement.legal')}</option>
            <option value="financial">{t('recordsManagement.financial')}</option>
            <option value="historical">{t('recordsManagement.historical')}</option>
          </select>
          <select className="glass-input px-3 py-2 rounded-lg cursor-pointer" value={recordType} onChange={e => setRecordType(e.target.value)}>
            <option value="essential">{t('recordsManagement.essential')}</option>
            <option value="important">{t('recordsManagement.important')}</option>
            <option value="useful">{t('recordsManagement.useful')}</option>
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">{t('recordsManagement.priority')}</label>
            <input type="number" min={1} max={5} className="glass-input w-20 px-3 py-2 rounded-lg" value={recoveryPriority} onChange={e => setRecoveryPriority(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">{t('recordsManagement.reviewMonths')}</label>
            <input type="number" min={1} max={36} className="glass-input w-20 px-3 py-2 rounded-lg" value={reviewCycleMonths} onChange={e => setReviewCycleMonths(Number(e.target.value))} />
          </div>
        </div>
        <textarea className="glass-input w-full px-3 py-2 rounded-lg resize-none" placeholder={t('recordsManagement.notes')} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('recordsManagement.cancel')}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!documentId || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('recordsManagement.designate')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
