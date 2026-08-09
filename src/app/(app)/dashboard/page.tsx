'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, FileCheck, GitBranch, FileLock, TrendingUp, Activity, ArrowRight, Star, Clock, History } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface DashboardData {
  stats: {
    totalDocuments: number;
    myDocuments: number;
    pendingApprovals: number;
    legalHolds: number;
    isAdmin: boolean;
  };
  breakdowns: {
    byState: { state: string; count: number }[];
    byClassification: { classification: { code: string; name: string; color: string } | null; count: number }[];
  };
  recentDocuments: any[];
  recentActivity: any[];
  myFavorites?: any[];
  myRecentViews?: any[];
}

const STATE_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  record: 'Record',
  archived: 'Archived',
  disposed: 'Disposed',
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/dashboard'),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-slate-100 dark:bg-slate-800 rounded" />)}
      </div>
    </div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Document governance overview for your tenant.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/documents">
            <Button variant="outline" size="sm">
              <FileText className="mr-2 h-4 w-4" />
              My documents
            </Button>
          </Link>
          <Link href="/documents?action=upload">
            <Button size="sm">
              Upload
            </Button>
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Total documents"
          value={data.stats.totalDocuments}
          accent="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          icon={<FileCheck className="h-4 w-4" />}
          label="My documents"
          value={data.stats.myDocuments}
          accent="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={<GitBranch className="h-4 w-4" />}
          label="Pending approvals"
          value={data.stats.pendingApprovals}
          accent="text-amber-600 dark:text-amber-400"
          link="/workflows?assignedToMe=true"
        />
        <StatCard
          icon={<FileLock className="h-4 w-4" />}
          label="Active legal holds"
          value={data.stats.legalHolds}
          accent="text-red-600 dark:text-red-400"
          link="/admin/legal-holds"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent documents */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Recent documents</CardTitle>
              <CardDescription>Documents recently updated in your tenant</CardDescription>
            </div>
            <Link href="/documents">
              <Button variant="ghost" size="sm" className="text-xs">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No documents yet. <Link href="/documents?action=upload" className="text-blue-600 underline">Upload your first document</Link>.
              </p>
            ) : (
              <div className="space-y-2">
                {data.recentDocuments.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="flex items-center gap-3 p-3 rounded-md border border-slate-100 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  >
                    <div
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: doc.classification?.color || '#94a3b8' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.classification?.name ?? 'Unclassified'} · {doc.owner?.name ?? 'Unknown'} · {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">{STATE_LABELS[doc.state] ?? doc.state}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Breakdowns */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                By classification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.breakdowns.byClassification.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data</p>
              ) : (
                data.breakdowns.byClassification.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: b.classification?.color || '#94a3b8' }}
                      />
                      <span className="text-muted-foreground">{b.classification?.name ?? 'Unclassified'}</span>
                    </div>
                    <span className="font-medium tabular-nums">{b.count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                By state
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.breakdowns.byState.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data</p>
              ) : (
                data.breakdowns.byState.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{STATE_LABELS[b.state] ?? b.state}</span>
                    <span className="font-medium tabular-nums">{b.count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Favorites + Recent views */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4" />
              My favorites
            </CardTitle>
            <CardDescription>Documents you've starred</CardDescription>
          </CardHeader>
          <CardContent>
            {!data.myFavorites || data.myFavorites.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No favorites yet. Click the star icon on a document to add it.
              </p>
            ) : (
              <div className="space-y-2">
                {data.myFavorites.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  >
                    <div
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: doc.classification?.color || '#94a3b8' }}
                    />
                    <span className="text-sm truncate flex-1">{doc.title}</span>
                    <Badge variant="outline" className="text-xs">{doc.state}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Recently viewed
            </CardTitle>
            <CardDescription>Your last 5 accessed documents</CardDescription>
          </CardHeader>
          <CardContent>
            {!data.myRecentViews || data.myRecentViews.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No recent views.
              </p>
            ) : (
              <div className="space-y-2">
                {data.myRecentViews.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  >
                    <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <div
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: doc.classification?.color || '#94a3b8' }}
                    />
                    <span className="text-sm truncate flex-1">{doc.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(doc.viewedAt), { addSuffix: true })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent activity
          </CardTitle>
          <CardDescription>Latest tamper-evident audit events</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No activity recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {data.recentActivity.map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    ev.result === 'allow' ? 'bg-emerald-500' : ev.result === 'deny' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  <span className="font-mono text-xs text-muted-foreground">{ev.eventType}</span>
                  <span className="flex-1 truncate">
                    {ev.actorEmail && <span className="text-muted-foreground">{ev.actorEmail} </span>}
                    {ev.resourceName && <span>{ev.resourceName}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon, label, value, accent, link,
}: { icon: React.ReactNode; label: string; value: number; accent: string; link?: string }) {
  const content = (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span className={accent}>{icon}</span>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
  return link ? <Link href={link}>{content}</Link> : content;
}
