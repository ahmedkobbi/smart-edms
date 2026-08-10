'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');

  const { data, isLoading } = useQuery<any>({
    queryKey: ['workflow', params.id],
    queryFn: () => api.get(`/api/workflows/${params.id}`),
  });

  const decide = useMutation({
    mutationFn: ({ approvalId, decision }: { approvalId: string; decision: 'approve' | 'reject' }) =>
      api.post(`/api/workflows/${params.id}/approve`, { approvalId, decision, comment }),
    onSuccess: () => {
      toast({ title: 'Decision recorded' });
      qc.invalidateQueries({ queryKey: ['workflow', params.id] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
      setComment('');
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const wf = data.workflow;
  const myPendingApproval = wf.approvals.find((a: any) => a.approverId === wf.initiator?.id && a.status === 'pending');

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Link href="/workflows" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to workflows
      </Link>

      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">{wf.name}</h1>
          <Badge variant={wf.status === 'approved' ? 'default' : wf.status === 'rejected' ? 'destructive' : 'secondary'}>
            {wf.status}
          </Badge>
        </div>
        {wf.reason && <p className="text-sm text-muted-foreground">{wf.reason}</p>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Document</CardTitle></CardHeader>
        <CardContent>
          {wf.document ? (
            <Link href={`/documents/${wf.document.id}`} className="text-blue-600 hover:underline">
              {wf.document.title}
              {wf.document.classification && (
                <span className="ml-2 font-mono text-xs" style={{ color: wf.document.classification.color }}>
                  {wf.document.classification.code}
                </span>
              )}
            </Link>
          ) : <p className="text-sm text-muted-foreground">No document</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approval steps</CardTitle>
          <CardDescription>Sequential approvals. Each step may require one or more approvers.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {wf.approvals.map((a: any) => (
              <div key={a.id} className="p-4 flex items-start gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                  a.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                  a.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' :
                  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                }`}>
                  {a.status === 'approved' ? <CheckCircle2 className="h-4 w-4" /> :
                   a.status === 'rejected' ? <XCircle className="h-4 w-4" /> :
                   <span className="text-xs font-medium">{a.stepIndex + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Step {a.stepIndex + 1}: {a.stepName}</p>
                  <p className="text-xs text-muted-foreground">
                    Approver: {a.approver?.name ?? a.approver?.email ?? 'Unknown'}
                    {a.decidedAt && ` · ${formatDistanceToNow(new Date(a.decidedAt), { addSuffix: true })}`}
                    {a.dueAt && a.status === 'pending' && ` · due ${formatDistanceToNow(new Date(a.dueAt), { addSuffix: true })}`}
                  </p>
                  {a.comment && <p className="text-xs italic mt-1">"{a.comment}"</p>}
                  {a.signature && (
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">signature:{a.signature.slice(0, 16)}…</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {myPendingApproval && (
        <Card>
          <CardHeader><CardTitle className="text-base">Your decision</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="comment">Comment (optional)</Label>
              <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Add context for your decision…" />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => decide.mutate({ approvalId: myPendingApproval.id, decision: 'approve' })}
                disabled={decide.isPending}
              >
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => decide.mutate({ approvalId: myPendingApproval.id, decision: 'reject' })}
                disabled={decide.isPending}
              >
                <XCircle className="mr-2 h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
