'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { GlassCard } from '@/components/ui/premium';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FolderTree, ShieldCheck, X, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DocumentRecordsTabProps {
  documentId: string;
}

export function DocumentRecordsTab({ documentId }: DocumentRecordsTabProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [showVitalForm, setShowVitalForm] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['document-record-category', documentId],
    queryFn: () => api.get(`/api/documents/${documentId}/record-category`),
  });

  const { data: categoriesData } = useQuery<any>({
    queryKey: ['record-categories-public'],
    queryFn: () => api.get('/api/records/categories-public'),
  });

  const assignMutation = useMutation({
    mutationFn: (categoryId: string | null) =>
      api.post(`/api/documents/${documentId}/record-category`, { categoryId }),
    onSuccess: (_data: any, categoryId) => {
      toast({
        title: categoryId === null ? t('recordsManagement.categoryRemoved') : t('recordsManagement.categoryAssigned'),
      });
      setShowAssign(false);
      queryClient.invalidateQueries({ queryKey: ['document-record-category', documentId] });
    },
    onError: (err: any) => toast({ title: t('securityAudit.failed'), description: err?.message, variant: 'destructive' }),
  });

  const designateVitalMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/vital', { ...data, documentId }),
    onSuccess: () => {
      toast({ title: t('recordsManagement.vitalDesignated') });
      setShowVitalForm(false);
      queryClient.invalidateQueries({ queryKey: ['document-record-category', documentId] });
    },
    onError: (err: any) => toast({ title: t('securityAudit.failed'), description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const category = data?.category;
  const vitalRecord = data?.vitalRecord;
  const categories = categoriesData?.items || [];

  return (
    <div className="space-y-4">
      {/* Record Category Assignment */}
      <GlassCard className="p-5" hover={false}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">{t('recordsManagement.recordCategory')}</h3>
          </div>
          {category ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}>
                {t('recordsManagement.assignCategory')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => assignMutation.mutate(null)}>
                <X className="h-4 w-4" /> {t('recordsManagement.removeAssignment')}
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setShowAssign(true)}>
              <Plus className="h-4 w-4" /> {t('recordsManagement.assignToCategory')}
            </Button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {category ? (
            <motion.div
              key="assigned"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-xl p-4 border border-primary/20"
            >
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="outline" className="text-base font-mono">{category.code}</Badge>
                <span className="font-medium text-lg">{category.name}</span>
                {category.isVital && (
                  <Badge className="bg-red-500/10 text-red-700 dark:text-red-400">
                    <ShieldCheck className="h-3 w-3 me-1" /> {t('recordsManagement.vitalRecords')}
                  </Badge>
                )}
                {category.isOnHold && (
                  <Badge variant="destructive">Legal Hold</Badge>
                )}
              </div>
              {category.description && (
                <p className="text-sm text-muted-foreground mb-3">{category.description}</p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t('recordsManagement.disposition')}</p>
                  <Badge variant="secondary" className="capitalize mt-1">{category.disposition}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('recordsManagement.retention')}</p>
                  <p className="font-medium mt-1">
                    {category.retentionActiveYears != null
                      ? `${category.retentionActiveYears} ${t('recordsManagement.yearsActive')} ${category.retentionSemiActiveYears || 0} ${t('recordsManagement.semiActive')}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('recordsManagement.disposition')}</p>
                  <p className="font-medium mt-1 capitalize">{category.dispositionAction || '—'}</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="unassigned"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-xl p-6 text-center border-dashed border-2"
            >
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">{t('recordsManagement.notAssigned')}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category selector */}
        {showAssign && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 p-4 glass-card rounded-xl"
          >
            <h4 className="text-sm font-semibold mb-3">{t('recordsManagement.selectCategoryPlaceholder')}</h4>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">{t('recordsManagement.noCategories')}</p>
              ) : (
                categories.map((cat: any) => (
                  <button
                    key={cat.id}
                    onClick={() => assignMutation.mutate(cat.id)}
                    className="w-full text-start p-2 rounded-lg hover:bg-primary/5 transition-colors flex items-center gap-2"
                  >
                    <Badge variant="outline" className="font-mono">{cat.code}</Badge>
                    <span className="text-sm">{cat.name}</span>
                    {cat.isVital && <ShieldCheck className="h-3 w-3 text-red-500 ms-auto" />}
                  </button>
                ))
              )}
            </div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAssign(false)}>
              {t('securityAudit.cancel')}
            </Button>
          </motion.div>
        )}
      </GlassCard>

      {/* Vital Record Status */}
      <GlassCard className="p-5" hover={false}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">{t('recordsManagement.vitalRecordStatus')}</h3>
          </div>
          {!vitalRecord && (
            <Button size="sm" onClick={() => setShowVitalForm(!showVitalForm)}>
              <Plus className="h-4 w-4" /> {t('recordsManagement.designateAsVital')}
            </Button>
          )}
        </div>

        {vitalRecord ? (
          <div className="glass-card rounded-xl p-4 border border-red-500/20 bg-red-500/5">
            <div className="flex items-center gap-3 mb-3">
              <Badge className="bg-red-500/10 text-red-700 dark:text-red-400 capitalize">{vitalRecord.recordType}</Badge>
              <Badge variant="outline" className="capitalize">{vitalRecord.vitalReason}</Badge>
              <Badge variant="outline">{t('recordsManagement.priority')} {vitalRecord.recoveryPriority}</Badge>
              {vitalRecord.backupVerified ? (
                <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
                  <CheckCircle className="h-3 w-3 me-1" /> {t('recordsManagement.verified')}
                </Badge>
              ) : (
                <Badge variant="destructive">{t('recordsManagement.unverified')}</Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('recordsManagement.nextReview')}</p>
                <p className="font-medium mt-1">
                  {vitalRecord.nextReviewAt ? new Date(vitalRecord.nextReviewAt).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('recordsManagement.lastVerified')}</p>
                <p className="font-medium mt-1">
                  {vitalRecord.lastVerifiedAt ? new Date(vitalRecord.lastVerifiedAt).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">{t('recordsManagement.notVital')}</p>
            <p className="text-xs text-muted-foreground">{t('recordsManagement.vitalRecordInfo')}</p>
          </div>
        )}

        {/* Vital record designation form */}
        {showVitalForm && !vitalRecord && (
          <VitalDesignationForm
            onSubmit={(data) => designateVitalMutation.mutate(data)}
            onCancel={() => setShowVitalForm(false)}
            isPending={designateVitalMutation.isPending}
            t={t}
          />
        )}
      </GlassCard>
    </div>
  );
}

function VitalDesignationForm({ onSubmit, onCancel, isPending, t }: {
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isPending: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  const [vitalReason, setVitalReason] = useState('operational');
  const [recordType, setRecordType] = useState('important');
  const [recoveryPriority, setRecoveryPriority] = useState(3);
  const [reviewCycleMonths, setReviewCycleMonths] = useState(12);
  const [notes, setNotes] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-4 p-4 glass-card rounded-xl space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <select
          className="glass-input px-3 py-2 rounded-lg"
          value={vitalReason}
          onChange={e => setVitalReason(e.target.value)}
        >
          <option value="operational">{t('recordsManagement.operational')}</option>
          <option value="legal">{t('recordsManagement.legal')}</option>
          <option value="financial">{t('recordsManagement.financial')}</option>
          <option value="historical">{t('recordsManagement.historical')}</option>
        </select>
        <select
          className="glass-input px-3 py-2 rounded-lg"
          value={recordType}
          onChange={e => setRecordType(e.target.value)}
        >
          <option value="essential">{t('recordsManagement.essential')}</option>
          <option value="important">{t('recordsManagement.important')}</option>
          <option value="useful">{t('recordsManagement.useful')}</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm whitespace-nowrap">{t('recordsManagement.priority')}</label>
          <input
            type="number" min={1} max={5}
            className="glass-input w-20 px-3 py-2 rounded-lg"
            value={recoveryPriority}
            onChange={e => setRecoveryPriority(Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm whitespace-nowrap">{t('recordsManagement.reviewMonths')}</label>
          <input
            type="number" min={1} max={36}
            className="glass-input w-20 px-3 py-2 rounded-lg"
            value={reviewCycleMonths}
            onChange={e => setReviewCycleMonths(Number(e.target.value))}
          />
        </div>
      </div>
      <textarea
        className="glass-input w-full px-3 py-2 rounded-lg"
        placeholder={t('recordsManagement.notes')}
        rows={2}
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>{t('securityAudit.cancel')}</Button>
        <Button
          size="sm"
          onClick={() => onSubmit({ vitalReason, recordType, recoveryPriority, reviewCycleMonths, notes })}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('recordsManagement.designate')}
        </Button>
      </div>
    </motion.div>
  );
}
