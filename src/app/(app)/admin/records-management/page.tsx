'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, FolderTree, ShieldCheck, AlertCircle, FileCheck, Download, Plus } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

export default function RecordsManagementPage() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

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
          <p className="text-sm text-muted-foreground mt-1">{t('recordsManagement.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/records-management/folders')}>
            <FolderTree className="h-4 w-4" /> {t('recordsManagement.folders')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/records-management/vital')}>
            <ShieldCheck className="h-4 w-4" /> {t('recordsManagement.vitalRecords')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/records-management/authorities')}>
            <FileCheck className="h-4 w-4" /> {t('recordsManagement.authorities')}
          </Button>
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold">{report.summary.totalCategories}</div>
              <div className="text-xs text-muted-foreground">{t('recordsManagement.totalCategories')}</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold">{report.summary.totalFolders}</div>
              <div className="text-xs text-muted-foreground">{t('recordsManagement.folders')}</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold text-green-600">{report.summary.vitalRecordsVerified}</div>
              <div className="text-xs text-muted-foreground">{t('recordsManagement.vitalVerified')}</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold text-amber-600">{report.summary.vitalRecordsDueReview}</div>
              <div className="text-xs text-muted-foreground">{t('recordsManagement.dueReview')}</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold">{report.summary.dispositionAuthorities}</div>
              <div className="text-xs text-muted-foreground">{t('recordsManagement.authorities')}</div>
            </GlassCard>
          </div>

          <GlassCard className="p-6" hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                {t('recordsManagement.dodCompliance')}
              </h2>
              <Button variant="outline" size="sm" onClick={() => window.open('/api/records/compliance-report', '_blank')}>
                <Download className="h-4 w-4" /> {t('recordsManagement.export')}
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
                  {req.implemented && <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">{t('recordsManagement.implemented')}</Badge>}
                </div>
              ))}
            </div>
          </GlassCard>
        </>
      )}

      {showCreate && <CreateCategoryForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['record-categories'] }); queryClient.invalidateQueries({ queryKey: ['dod-compliance-report'] }); }} />}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{t('recordsManagement.categories')}</h2>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> {t('recordsManagement.newCategory')}</Button>
        </div>
        <div className="space-y-2">
          {categories.length === 0 ? (
            <GlassCard className="p-8 text-center" hover={false}>
              <FolderTree className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">{t('recordsManagement.noCategories')}</p>
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
                        <p className="text-xs text-muted-foreground mt-1">{t('recordsManagement.retention')}: {cat.retentionActiveYears} {t('recordsManagement.yearsActive')} {cat.retentionSemiActiveYears || 0} {t('recordsManagement.semiActive')} → {cat.dispositionAction || 'N/A'}</p>
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


function CreateCategoryForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [disposition, setDisposition] = useState('temporary');
  const [retentionActiveYears, setRetentionActiveYears] = useState(3);
  const [isVital, setIsVital] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/categories', data),
    onSuccess: () => { toast({ title: t('recordsManagement.categoryCreated') }); onCreated(); },
    onError: (err: any) => toast({ title: t('recordsManagement.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">{t('recordsManagement.createCategory')}</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <input className="glass-input px-3 py-2 rounded-lg" placeholder={t('recordsManagement.code')} value={code} onChange={e => setCode(e.target.value)} />
          <input className="glass-input px-3 py-2 rounded-lg" placeholder={t('recordsManagement.name')} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder={t('recordsManagement.descriptionOptional')} rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <select className="glass-input px-3 py-2 rounded-lg" value={disposition} onChange={e => setDisposition(e.target.value)}>
            <option value="temporary">{t('recordsManagement.temporary')}</option>
            <option value="permanent">{t('recordsManagement.permanent')}</option>
            <option value="unscheduled">{t('recordsManagement.unscheduled')}</option>
          </select>
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">{t('recordsManagement.activeYears')}</label>
            <input type="number" min="0" className="glass-input w-20 px-3 py-2 rounded-lg" value={retentionActiveYears} onChange={e => setRetentionActiveYears(Number(e.target.value))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isVital} onChange={e => setIsVital(e.target.checked)} />
          {t('recordsManagement.vitalCategory')}
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>{t('recordsManagement.cancel')}</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ code, name, description, disposition, retentionActiveYears, isVital })} disabled={!code || !name || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
