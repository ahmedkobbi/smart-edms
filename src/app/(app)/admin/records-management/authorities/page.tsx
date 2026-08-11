'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, FileCheck, ArrowLeft, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/i18n/use-i18n';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const authorities = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/records-management')}><ArrowLeft className="h-4 w-4" /> {t('recordsManagement.back')}</Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FileCheck className="h-6 w-6 text-primary" /> {t('recordsManagement.authorities')}</h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> {t('recordsManagement.newAuthority')}</Button>
      </div>

      {showCreate && <CreateAuthorityForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['disposition-authorities'] }); }} />}

      <div className="space-y-2">
        {authorities.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}><p className="text-muted-foreground">{t('recordsManagement.noAuthorities')}</p></GlassCard>
        ) : (
          authorities.map((a: any) => (
            <GlassCard key={a.id} className="p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{a.authorityType.replace(/_/g, ' ')}</Badge>
                <Badge variant="secondary">{a.authorityNumber}</Badge>
                <span className="font-medium">{a.title}</span>
                <Badge variant="secondary" className="capitalize ms-auto">{a.status}</Badge>
              </div>
              {a.description && <p className="text-sm text-muted-foreground mt-1">{a.description}</p>}
              {a.effectiveDate && <p className="text-xs text-muted-foreground mt-1">{t('recordsManagement.effectiveDate')} {new Date(a.effectiveDate).toLocaleDateString()}</p>}
            </GlassCard>
          ))
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

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/authorities', data),
    onSuccess: () => { toast({ title: t('recordsManagement.authorityCreated') }); onCreated(); },
    onError: (err: any) => toast({ title: t('recordsManagement.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">{t('recordsManagement.createAuthority')}</h3>
      <div className="space-y-4">
        <select className="glass-input w-full px-3 py-2 rounded-lg" value={authorityType} onChange={e => setAuthorityType(e.target.value)}>
          <option value="agency_specific">{t('recordsManagement.agencySpecific')}</option>
          <option value="nara_grs">{t('recordsManagement.naraGrs')}</option>
          <option value="nara_sf">{t('recordsManagement.naraSf')}</option>
          <option value="court_order">{t('recordsManagement.courtOrder')}</option>
        </select>
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder={t('recordsManagement.authorityNumber')} value={authorityNumber} onChange={e => setAuthorityNumber(e.target.value)} />
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder={t('recordsManagement.name')} value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder={t('recordsManagement.descriptionOptional')} rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="flex items-center gap-2">
          <label className="text-sm">{t('recordsManagement.activeYears')}</label>
          <input type="number" className="glass-input w-24 px-3 py-2 rounded-lg" value={active} onChange={e => setActive(Number(e.target.value))} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>{t('recordsManagement.cancel')}</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ authorityType, authorityNumber, title, description, retentionInstructions: { active, disposition: 'destroy' } })} disabled={!authorityNumber || !title || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('recordsManagement.create')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
