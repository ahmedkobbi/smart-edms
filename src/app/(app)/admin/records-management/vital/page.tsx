'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, ShieldCheck, ArrowLeft, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function VitalRecordsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

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
