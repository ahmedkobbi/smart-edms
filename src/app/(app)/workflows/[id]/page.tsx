'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useSession } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: session } = useSession();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [signatureText, setSignatureText] = useState('');
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateUserId, setDelegateUserId] = useState('');
  const [delegateReason, setDelegateReason] = useState('');

  const { data, isLoading } = useQuery<any>({
    queryKey: ['workflow', params.id],
    queryFn: () => api.get(`/api/workflows/${params.id}`),
  });

  const decide = useMutation({
    mutationFn: ({ approvalId, decision }: { approvalId: string; decision: 'approve' | 'reject' }) =>
      api.post(`/api/workflows/${params.id}/approve`, {
        approvalId,
        decision,
        comment,
        signatureText: signatureText || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Decision recorded' });
      qc.invalidateQueries({ queryKey: ['workflow', params.id] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
      setComment('');
      setSignatureText('');
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const delegate = useMutation({
    mutationFn: ({ approvalId, toUserId, reason }: { approvalId: string; toUserId: string; reason: string }) =>
      api.post(`/api/workflows/${params.id}/delegate`, { approvalId, toUserId, reason }),
    onSuccess: () => {
      toast({ title: 'Approval delegated' });
      setDelegateOpen(false);
      setDelegateUserId('');
      setDelegateReason('');
      qc.invalidateQueries({ queryKey: ['workflow', params.id] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const wf = data.workflow;
  // Fix: find the current user's pending approval (not the initiator's)
  const myPendingApproval = wf.approvals.find(
    (a: any) => a.approverId === (session?.user as any)?.id && a.status === 'pending',
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Link href="/workflows" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="me-1 h-3.5 w-3.5" /> Back to workflows
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
                <span className="ms-2 font-mono text-xs" style={{ color: wf.document.classification.color }}>
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
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add context for your decision…"
                dir="auto"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="signature">Signature text (type your full name to sign)</Label>
              <Input
                id="signature"
                value={signatureText}
                onChange={(e) => setSignatureText(e.target.value)}
                placeholder={session?.user?.name || 'Type your name'}
                dir="auto"
              />
              <p className="text-xs text-muted-foreground">
                Your typed name is recorded as an electronic attestation (SHA-256 hash) in the audit trail.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => decide.mutate({ approvalId: myPendingApproval.id, decision: 'approve' })}
                disabled={decide.isPending || !signatureText.trim()}
              >
                <CheckCircle2 className="me-2 h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => decide.mutate({ approvalId: myPendingApproval.id, decision: 'reject' })}
                disabled={decide.isPending || !signatureText.trim()}
              >
                <XCircle className="me-2 h-3.5 w-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDelegateOpen(true)}
                disabled={delegate.isPending}
              >
                <UserCheck className="me-2 h-3.5 w-3.5" /> Delegate
              </Button>
            </div>
            {!signatureText.trim() && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Type your signature text above to enable the decision buttons.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delegate dialog */}
      <Dialog open={delegateOpen} onOpenChange={setDelegateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delegate approval</DialogTitle>
            <DialogDescription>
              Transfer your approval responsibility to another active user in this tenant.
              They will receive a notification and become the new approver.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="delegate-user">Delegate to (user ID)</Label>
              <Input
                id="delegate-user"
                value={delegateUserId}
                onChange={(e) => setDelegateUserId(e.target.value)}
                placeholder="User ID"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="delegate-reason">Reason</Label>
              <Textarea
                id="delegate-reason"
                value={delegateReason}
                onChange={(e) => setDelegateReason(e.target.value)}
                rows={2}
                placeholder="Why are you delegating this approval?"
                dir="auto"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelegateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => delegate.mutate({
                approvalId: myPendingApproval?.id || '',
                toUserId: delegateUserId,
                reason: delegateReason,
              })}
              disabled={delegate.isPending || !delegateUserId.trim() || !delegateReason.trim()}
            >
              {delegate.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              Delegate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
