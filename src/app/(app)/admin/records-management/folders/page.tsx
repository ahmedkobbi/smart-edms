'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, Folder, Scissors, Trash2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function FoldersPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['record-folders'],
    queryFn: () => api.get('/api/records/folders'),
  });

  const cutoffMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/records/folders/${id}/cutoff`),
    onSuccess: () => { toast({ title: 'Folder cut off' }); queryClient.invalidateQueries({ queryKey: ['record-folders'] }); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const disposeMutation = useMutation({
    mutationFn: ({ id, method }: { id: string; method: string }) => api.post(`/api/records/folders/${id}/dispose`, { method }),
    onSuccess: () => { toast({ title: 'Folder disposed' }); queryClient.invalidateQueries({ queryKey: ['record-folders'] }); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const folders = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/records-management')}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Folder className="h-6 w-6 text-primary" /> Record Folders</h1>
      </div>

      <div className="space-y-2">
        {folders.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}><p className="text-muted-foreground">No record folders yet.</p></GlassCard>
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
                    {f.eligibleForDispositionAt && <span className="ms-3">Eligible: {new Date(f.eligibleForDispositionAt).toLocaleDateString()}</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {f.status === 'open' && (
                    <Button size="sm" variant="outline" onClick={() => cutoffMutation.mutate(f.id)}><Scissors className="h-4 w-4" /> Cutoff</Button>
                  )}
                  {f.status === 'cutoff' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => disposeMutation.mutate({ id: f.id, method: 'destroyed' })}><Trash2 className="h-4 w-4" /> Destroy</Button>
                      <Button size="sm" variant="outline" onClick={() => disposeMutation.mutate({ id: f.id, method: 'transferred' })}>Transfer</Button>
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
