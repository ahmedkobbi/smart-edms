'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GitBranch, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface WorkflowItem {
  id: string;
  name: string;
  status: string;
  currentStep: number;
  dueAt: string | null;
  completedAt: string | null;
  reason: string | null;
  createdAt: string;
  document: { id: string; title: string; classification: { code: string; name: string; color: string } | null } | null;
  initiator: { id: string; name: string | null; email: string } | null;
  approvals: any[];
}

export default function WorkflowsPage() {
  const search = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState(search.get('assignedToMe') === 'true' ? 'mine' : 'all');

  const { data, isLoading } = useQuery<{ items: WorkflowItem[]; total: number }>({
    queryKey: ['workflows', tab],
    queryFn: () => api.get(`/api/workflows?${tab === 'mine' ? 'assignedToMe=true&' : ''}pageSize=50`),
  });

  const approve = useMutation({
    mutationFn: ({ id, approvalId, decision, comment }: { id: string; approvalId: string; decision: 'approve' | 'reject'; comment?: string }) =>
      api.post(`/api/workflows/${id}/approve`, { approvalId, decision, comment }),
    onSuccess: () => {
      toast({ title: 'Decision recorded' });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve document workflows routed to you.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All workflows</TabsTrigger>
          <TabsTrigger value="mine">Assigned to me</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : !data?.items?.length ? (
        <Card>
          <CardContent className="p-12 text-center">
            <GitBranch className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">No workflows</p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === 'mine' ? 'You have no pending approvals.' : 'No workflows have been created yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((wf) => {
            const myApproval = wf.approvals.find((a) => a.approverId === wf.initiator?.id && a.status === 'pending');
            const pendingApprovals = wf.approvals.filter((a) => a.status === 'pending');
            return (
              <Card key={wf.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/workflows/${wf.id}`} className="font-medium hover:underline">
                          {wf.name}
                        </Link>
                        <Badge variant={wf.status === 'approved' ? 'default' : wf.status === 'rejected' ? 'destructive' : 'secondary'} className="text-xs">
                          {wf.status}
                        </Badge>
                      </div>
                      {wf.document && (
                        <Link href={`/documents/${wf.document.id}`} className="text-sm text-muted-foreground hover:underline mt-1 block">
                          {wf.document.title}
                          {wf.document.classification && (
                            <span className="ml-2 font-mono text-xs" style={{ color: wf.document.classification.color }}>
                              {wf.document.classification.code}
                            </span>
                          )}
                        </Link>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Initiated by {wf.initiator?.name ?? wf.initiator?.email ?? 'Unknown'} · {formatDistanceToNow(new Date(wf.createdAt), { addSuffix: true })}
                        {wf.dueAt && ` · due ${formatDistanceToNow(new Date(wf.dueAt), { addSuffix: true })}`}
                      </p>
                      <div className="flex gap-2 mt-2 text-xs">
                        {wf.approvals.map((a: any, i: number) => (
                          <span key={a.id} className="flex items-center gap-1">
                            {a.status === 'approved' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> :
                             a.status === 'rejected' ? <XCircle className="h-3 w-3 text-red-500" /> :
                             <Clock className="h-3 w-3 text-amber-500" />}
                            Step {i + 1}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Link href={`/workflows/${wf.id}`}>
                        <Button variant="outline" size="sm">Open</Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
