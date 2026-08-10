'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { FileText, FileCheck, GitBranch, FileLock, TrendingUp, Activity, ArrowRight, Star, Clock, History, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { AnimatedCounter, LoadingState, GlassCard, StaggerContainer, StaggerItem, GradientBadge } from '@/components/ui/premium';
import { useI18n } from '@/i18n/use-i18n';

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
  draft: 'Draft', active: 'Active', record: 'Record', archived: 'Archived', disposed: 'Disposed',
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/dashboard'),
    refetchInterval: 60_000,
  });
  const { t } = useI18n();

  if (isLoading || !data) {
    return <LoadingState message={t('common.loading')} />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/documents">
            <Button variant="outline" size="sm" className="glass-input border-0 hover-lift">
              <FileText className="mr-2 h-4 w-4" />
              {t('dashboard.myDocuments')}
            </Button>
          </Link>
          <Link href="/documents?action=upload">
            <Button size="sm" className="btn-premium">
              {t('dashboard.upload')}
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Stat cards with animated counters */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StaggerItem>
          <GlassCard className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10 bg-blue-500" />
            <div className="flex items-center justify-between mb-2 relative">
              <p className="text-xs font-medium text-muted-foreground">{t('dashboard.totalDocuments')}</p>
              <span className="text-blue-500"><FileText className="h-4 w-4" /></span>
            </div>
            <AnimatedCounter value={data.stats.totalDocuments} className="text-2xl font-semibold tabular-nums" />
          </GlassCard>
        </StaggerItem>
        <StaggerItem>
          <GlassCard className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10 bg-emerald-500" />
            <div className="flex items-center justify-between mb-2 relative">
              <p className="text-xs font-medium text-muted-foreground">{t('dashboard.myDocuments')}</p>
              <span className="text-emerald-500"><FileCheck className="h-4 w-4" /></span>
            </div>
            <AnimatedCounter value={data.stats.myDocuments} className="text-2xl font-semibold tabular-nums" />
          </GlassCard>
        </StaggerItem>
        <StaggerItem>
          <GlassCard className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10 bg-amber-500" />
            <div className="flex items-center justify-between mb-2 relative">
              <p className="text-xs font-medium text-muted-foreground">{t('dashboard.pendingApprovals')}</p>
              <span className="text-amber-500"><GitBranch className="h-4 w-4" /></span>
            </div>
            <Link href="/workflows?assignedToMe=true" className="hover:underline">
              <AnimatedCounter value={data.stats.pendingApprovals} className="text-2xl font-semibold tabular-nums" />
            </Link>
          </GlassCard>
        </StaggerItem>
        <StaggerItem>
          <GlassCard className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10 bg-red-500" />
            <div className="flex items-center justify-between mb-2 relative">
              <p className="text-xs font-medium text-muted-foreground">{t('dashboard.activeLegalHolds')}</p>
              <span className="text-red-500"><FileLock className="h-4 w-4" /></span>
            </div>
            <Link href="/admin/legal-holds" className="hover:underline">
              <AnimatedCounter value={data.stats.legalHolds} className="text-2xl font-semibold tabular-nums" />
            </Link>
          </GlassCard>
        </StaggerItem>
      </StaggerContainer>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent documents */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="lg:col-span-2"
        >
          <Card className="glass-card border-0">
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
                <StaggerContainer className="space-y-2" stagger={0.04}>
                  {data.recentDocuments.map((doc) => (
                    <StaggerItem key={doc.id}>
                      <Link
                        href={`/documents/${doc.id}`}
                        className="flex items-center gap-3 p-3 rounded-lg glass-card border-0 hover-lift"
                      >
                        <div
                          className="h-2 w-2 rounded-full flex-shrink-0 animate-pulse-glow"
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
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Breakdowns */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="space-y-4"
        >
          <Card className="glass-card border-0">
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
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: b.classification?.color || '#94a3b8' }}
                      />
                      <span className="text-muted-foreground">{b.classification?.name ?? 'Unclassified'}</span>
                    </div>
                    <span className="font-medium tabular-nums">{b.count}</span>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="glass-card border-0">
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
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{STATE_LABELS[b.state] ?? b.state}</span>
                    <span className="font-medium tabular-nums">{b.count}</span>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Favorites + Recent views */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="glass-card border-0 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400" />
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
                <StaggerContainer className="space-y-2">
                  {data.myFavorites.map((doc) => (
                    <StaggerItem key={doc.id}>
                      <Link
                        href={`/documents/${doc.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg glass-card border-0 hover-lift"
                      >
                        <div
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: doc.classification?.color || '#94a3b8' }}
                        />
                        <span className="text-sm truncate flex-1">{doc.title}</span>
                        <Badge variant="outline" className="text-xs">{doc.state}</Badge>
                      </Link>
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="glass-card border-0 h-full">
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
                <StaggerContainer className="space-y-2">
                  {data.myRecentViews.map((doc) => (
                    <StaggerItem key={doc.id}>
                      <Link
                        href={`/documents/${doc.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg glass-card border-0 hover-lift"
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
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent activity */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card className="glass-card border-0">
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
              <StaggerContainer className="space-y-1" stagger={0.03}>
                {data.recentActivity.map((ev) => (
                  <StaggerItem key={ev.id}>
                    <div className="flex items-center gap-3 py-1.5 text-sm">
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
                  </StaggerItem>
                ))}
              </StaggerContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
