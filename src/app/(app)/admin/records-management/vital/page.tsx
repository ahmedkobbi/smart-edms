'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, ShieldCheck, ArrowLeft, CheckCircle, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function VitalRecordsPage() {
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
    queryKey: ['vital-records'],
    queryFn: () => api.get('/api/records/vital'),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/records/vital/${id}`, { verifyBackup: true }),
    onSuccess: () => { toast({ title: 'Backup verified' }); queryClient.invalidateQueries({ queryKey: ['vital-records'] }); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const records = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/records-management')}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Vital Records</h1>
      </div>

      {showCreate && <DesignateVitalForm categories={categories} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['vital-records'] }); }} />}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Designate Vital Record</Button>
      </div>

      <div className="space-y-2">
        {records.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}><p className="text-muted-foreground">No vital records designated.</p></GlassCard>
        ) : (
          records.map((v: any) => (
            <GlassCard key={v.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{v.document?.title || 'Unknown'}</span>
                    <Badge className="capitalize bg-red-500/10 text-red-700 dark:text-red-400">{v.recordType}</Badge>
                    <Badge variant="outline" className="capitalize">{v.vitalReason}</Badge>
                    <Badge variant="outline">Priority {v.recoveryPriority}</Badge>
                    {v.backupVerified ? (
                      <Badge className="bg-green-500/10 text-green-700 dark:text-green-400"><CheckCircle className="h-3 w-3 me-1" /> Verified</Badge>
                    ) : (
                      <Badge variant="destructive">Unverified</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Next review: {v.nextReviewAt ? new Date(v.nextReviewAt).toLocaleDateString() : '—'}
                    {v.lastVerifiedAt && <span className="ms-3">Last verified: {new Date(v.lastVerifiedAt).toLocaleDateString()}</span>}
                  </p>
                </div>
                {!v.backupVerified && (
                  <Button size="sm" variant="outline" onClick={() => verifyMutation.mutate(v.id)}>
                    <CheckCircle className="h-4 w-4" /> Verify Backup
                  </Button>
                )}
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}


function DesignateVitalForm({ categories, onClose, onCreated }: { categories: any[]; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [documentId, setDocumentId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [vitalReason, setVitalReason] = useState('operational');
  const [recordType, setRecordType] = useState('important');
  const [recoveryPriority, setRecoveryPriority] = useState(3);
  const [reviewCycleMonths, setReviewCycleMonths] = useState(12);
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/vital', data),
    onSuccess: () => { toast({ title: 'Vital record designated' }); onCreated(); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">Designate Vital Record</h3>
      <div className="space-y-4">
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Document ID" value={documentId} onChange={e => setDocumentId(e.target.value)} />
        <select className="glass-input w-full px-3 py-2 rounded-lg" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">Select category (optional)...</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-4">
          <select className="glass-input px-3 py-2 rounded-lg" value={vitalReason} onChange={e => setVitalReason(e.target.value)}>
            <option value="operational">Operational</option>
            <option value="legal">Legal</option>
            <option value="financial">Financial</option>
            <option value="historical">Historical</option>
          </select>
          <select className="glass-input px-3 py-2 rounded-lg" value={recordType} onChange={e => setRecordType(e.target.value)}>
            <option value="essential">Essential (highest)</option>
            <option value="important">Important</option>
            <option value="useful">Useful</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">Priority (1-5):</label>
            <input type="number" min="1" max="5" className="glass-input w-20 px-3 py-2 rounded-lg" value={recoveryPriority} onChange={e => setRecoveryPriority(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">Review (months):</label>
            <input type="number" min="1" max="36" className="glass-input w-20 px-3 py-2 rounded-lg" value={reviewCycleMonths} onChange={e => setReviewCycleMonths(Number(e.target.value))} />
          </div>
        </div>
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Notes (optional)" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ documentId, categoryId: categoryId || undefined, vitalReason, recordType, recoveryPriority, reviewCycleMonths, notes })} disabled={!documentId || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Designate'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
