'use client';

/**
 * Smart EDMS — Job monitoring dashboard
 *
 * Enterprise-grade admin UI for monitoring background job queues:
 *   - Queue metrics (waiting, active, completed, failed, delayed, paused)
 *   - Recent job history (from Prisma Job model)
 *   - Failed jobs list with retry/cancel actions
 *   - Queue pause/resume controls
 *   - Real-time refresh (auto-refresh every 10s)
 *
 * When Redis is unavailable, shows a banner explaining that jobs run
 * in-process (dev mode) and the queue dashboard is not available.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Play, Pause, RotateCcw, XCircle, AlertCircle, CheckCircle2, Clock, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

interface JobRecord {
  id: string;
  type: string;
  status: string;
  progress: number;
  result: any;
  error: string | null;
  startedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const QUEUE_ICONS: Record<string, typeof Activity> = {
  ocr: Activity,
  webhook: RefreshCw,
  evidence: CheckCircle2,
  reindex: RotateCcw,
  bulkImport: Clock,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'secondary',
  running: 'default',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
};

export default function AdminJobsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(true);
  // SECURITY FIX (L-ADM-4): Pagination state for job history.
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [queueFilter, setQueueFilter] = useState('');

  const { data, isLoading, refetch } = useQuery<{
    queues: QueueMetrics[];
    jobs: JobRecord[];
    failedJobs: Record<string, any[]>;
    pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  }>({
    queryKey: ['admin-jobs', page, statusFilter, queueFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (statusFilter) params.set('status', statusFilter);
      if (queueFilter) params.set('queue', queueFilter);
      return api.get(`/api/admin/jobs?${params.toString()}`);
    },
    refetchInterval: autoRefresh ? 10_000 : false,
  });

  const jobAction = useMutation({
    mutationFn: ({ jobId, action, queue }: { jobId: string; action: 'retry' | 'cancel'; queue: string }) =>
      api.post(`/api/admin/jobs/${jobId}`, { action, queue }),
    onSuccess: (_, vars) => {
      toast({ title: vars.action === 'retry' ? t('admin.jobs.retriedToast') : t('admin.jobs.cancelledToast') });
      qc.invalidateQueries({ queryKey: ['admin-jobs'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const redisAvailable = data?.queues && data.queues.length > 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6" /> {t('admin.jobs.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('admin.jobs.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            title={autoRefresh ? 'Auto-refresh on (10s)' : 'Auto-refresh off'}
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="ms-1 text-xs">{autoRefresh ? t('admin.jobs.live') : t('admin.jobs.paused')}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Redis status banner */}
      {!isLoading && !redisAvailable && (
        <Card className="border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {t('admin.jobs.redisUnavailableTitle')}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t('admin.jobs.redisUnavailableBody')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue metrics */}
      {redisAvailable && data?.queues && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.queues.map((q) => {
            const Icon = QUEUE_ICONS[q.name] || Activity;
            return (
              <Card key={q.name}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="capitalize">{q.name}</span>
                    </span>
                    {q.paused && <Badge variant="outline" className="text-xs">{t('admin.jobs.paused')}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{q.waiting}</p>
                      <p className="text-xs text-muted-foreground">{t('admin.jobs.waiting')}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{q.active}</p>
                      <p className="text-xs text-muted-foreground">{t('admin.jobs.active')}</p>
                    </div>
                    <div>
                      <p className={`text-2xl font-bold ${q.failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {q.failed}
                      </p>
                      <p className="text-xs text-muted-foreground">{t('admin.jobs.failed')}</p>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                    <span>{t('admin.jobs.completed')}: {q.completed}</span>
                    <span>{t('admin.jobs.delayed')}: {q.delayed}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Failed jobs */}
      {redisAvailable && data?.failedJobs && Object.values(data.failedJobs).flat().length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" /> {t('admin.jobs.failedJobsTitle')}
            </CardTitle>
            <CardDescription>{t('admin.jobs.failedJobsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {Object.entries(data.failedJobs).map(([queue, jobs]) =>
                jobs.map((job: any) => (
                  <div key={`${queue}:${job.id}`} className="p-4 flex items-start gap-3">
                    <Badge variant="destructive" className="mt-0.5 text-xs">{queue}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-mono truncate">{job.id}</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{job.failedReason || t('common.unknownError')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('admin.jobs.attempt')} {job.attemptsMade} · {job.finishedOn ? formatDistanceToNow(new Date(job.finishedOn), { addSuffix: true }) : t('admin.jobs.na')}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => jobAction.mutate({ jobId: job.id, action: 'retry', queue })}
                        disabled={jobAction.isPending}
                      >
                        <RotateCcw className="me-1 h-3 w-3" /> {t('admin.jobs.retry')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600"
                        onClick={() => jobAction.mutate({ jobId: job.id, action: 'cancel', queue })}
                        disabled={jobAction.isPending}
                      >
                        <XCircle className="me-1 h-3 w-3" /> {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                )),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent job history (from Prisma) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> {t('admin.jobs.historyTitle')}
              </CardTitle>
              <CardDescription>{t('admin.jobs.historyDesc')}</CardDescription>
            </div>
            {/* SECURITY FIX (L-ADM-4): Filters for job history */}
            <div className="flex items-center gap-2 text-xs">
              <select
                className="text-xs border rounded px-2 py-1 bg-background"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="">All status</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
                <option value="pending">Pending</option>
              </select>
              <select
                className="text-xs border rounded px-2 py-1 bg-background"
                value={queueFilter}
                onChange={(e) => { setQueueFilter(e.target.value); setPage(1); }}
              >
                <option value="">All queues</option>
                <option value="ocr">OCR</option>
                <option value="webhook">Webhook</option>
                <option value="evidence">Evidence</option>
                <option value="reindex">Reindex</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.jobs?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('admin.jobs.empty')}</p>
          ) : (
            <>
              <div className="divide-y divide-slate-100 dark:divide-slate-900">
                {data.jobs.map((job) => (
                  <div key={job.id} className="p-4 flex items-start gap-3">
                    <Badge variant={(STATUS_COLORS[job.status] as any) || 'secondary'} className="mt-0.5 text-xs capitalize">
                      {job.status}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{job.type}</p>
                        {job.progress > 0 && job.progress < 100 && (
                          <span className="text-xs text-muted-foreground">{job.progress}%</span>
                        )}
                      </div>
                      {job.error && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">{job.error}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                        {job.completedAt && ` · completed ${formatDistanceToNow(new Date(job.completedAt), { addSuffix: true })}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {/* SECURITY FIX (L-ADM-4): Pagination controls */}
              {data.pagination && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} total
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={data.pagination.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={data.pagination.page >= data.pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
