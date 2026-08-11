'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard, PremiumSkeleton, PremiumEmptyState } from '@/components/ui/premium';
import { Loader2, FileCheck, ArrowLeft, Plus, Calendar } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AuthoritiesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['disposition-authorities'],
    queryFn: () => api.get('/api/records/authorities'),
  });

  const authorities = data?.items || [];

  const typeConfig: Record<string, { color: string; bg: string; label: string }> = {
    nara_grs: { color: 'text-blue-600', bg: 'bg-blue-500/10', label: 'NARA GRS' },
    nara_sf: { color: 'text-blue-600', bg: 'bg-blue-500/10', label: 'NARA SF' },
    agency_specific: { color: 'text-primary', bg: 'bg-primary/5', label: 'Agency' },
    court_order: { color: 'text-red-600', bg: 'bg-red-500/10', label: 'Court' },
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
            <FileCheck className="h-6 w-6 text-primary" />
            {t('recordsManagement.authorities')}
          </h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('recordsManagement.newAuthority')}</span>
          <span className="sm:hidden">New</span>
        </Button>
      </motion.div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <CreateAuthorityForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['disposition-authorities'] }); }} />
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
                    <div className="flex gap-2"><PremiumSkeleton className="h-5 w-32" /><PremiumSkeleton className="h-6 w-20" /></div>
                    <PremiumSkeleton className="h-4 w-48" />
                    <PremiumSkeleton className="h-4 w-24" />
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : authorities.length === 0 ? (
          <PremiumEmptyState icon={FileCheck} title={t('recordsManagement.noAuthorities')} />
        ) : (
          <AnimatePresence mode="popLayout">
            {authorities.map((a: any, i: number) => {
              const config = typeConfig[a.authorityType] || typeConfig.agency_specific;
              return (
                <motion.div key={a.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ delay: i * 0.05 }}>
                  <GlassCard className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-xl ${config.bg} shrink-0`}>
                        <FileCheck className={`h-5 w-5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className={`${config.bg} ${config.color} border-0`}>{config.label}</Badge>
                          <Badge variant="secondary" className="font-mono">{a.authorityNumber}</Badge>
                          <span className="font-semibold truncate">{a.title}</span>
                          <Badge variant="outline" className="capitalize shrink-0">{a.status}</Badge>
                        </div>
                        {a.description && <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>}
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                          {a.effectiveDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {t('recordsManagement.effectiveDate')}{new Date(a.effectiveDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
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

function CreateAuthorityForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [authorityType, setAuthorityType] = useState('agency_specific');
  const [authorityNumber, setAuthorityNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(3);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/authorities', data),
    onSuccess: () => { toast({ title: t('recordsManagement.authorityCreated') }); onCreated(); },
    onError: (err: any) => toast({ title: t('recordsManagement.failed'), description: err?.message, variant: 'destructive' }),
  });

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!authorityNumber) newErrors.authorityNumber = 'Required';
    if (title.length < 3) newErrors.title = 'Minimum 3 characters';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    createMutation.mutate({ authorityType, authorityNumber, title, description, retentionInstructions: { active, disposition: 'destroy' } });
  };

  return (
    <GlassCard className="p-6" hover={false}>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Plus className="h-5 w-5 text-primary" />
        {t('recordsManagement.createAuthority')}
      </h3>
      <div className="space-y-4">
        <select className="glass-input w-full px-3 py-2 rounded-lg cursor-pointer" value={authorityType} onChange={e => setAuthorityType(e.target.value)}>
          <option value="agency_specific">{t('recordsManagement.agencySpecific')}</option>
          <option value="nara_grs">{t('recordsManagement.naraGrs')}</option>
          <option value="nara_sf">{t('recordsManagement.naraSf')}</option>
          <option value="court_order">{t('recordsManagement.courtOrder')}</option>
        </select>
        <div>
          <input className={`glass-input w-full px-3 py-2 rounded-lg font-mono ${errors.authorityNumber ? 'ring-2 ring-red-500/30' : ''}`} placeholder={t('recordsManagement.authorityNumber')} value={authorityNumber} onChange={e => { setAuthorityNumber(e.target.value); setErrors({}); }} />
          {errors.authorityNumber && <p className="text-xs text-red-500 mt-1">{errors.authorityNumber}</p>}
        </div>
        <div>
          <input className={`glass-input w-full px-3 py-2 rounded-lg ${errors.title ? 'ring-2 ring-red-500/30' : ''}`} placeholder={t('recordsManagement.name')} value={title} onChange={e => { setTitle(e.target.value); setErrors({}); }} />
          {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
        </div>
        <textarea className="glass-input w-full px-3 py-2 rounded-lg resize-none" placeholder={t('recordsManagement.descriptionOptional')} rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="flex items-center gap-2">
          <label className="text-sm whitespace-nowrap">{t('recordsManagement.activeYears')}</label>
          <input type="number" min={0} className="glass-input w-24 px-3 py-2 rounded-lg" value={active} onChange={e => setActive(Number(e.target.value))} />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('recordsManagement.cancel')}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!authorityNumber || !title || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('recordsManagement.create')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
