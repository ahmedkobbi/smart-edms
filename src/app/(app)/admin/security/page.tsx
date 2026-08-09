'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shield, ShieldAlert, ShieldCheck, Users, KeyRound, FileLock, Activity, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function SecurityPosturePage() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['security-posture'],
    queryFn: () => api.get('/api/admin/security-posture'),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin border-2 border-slate-300 border-t-slate-900 rounded-full" /></div>;
  }

  const gradeColor =
    data.security.postureGrade === 'A' ? 'text-emerald-600' :
    data.security.postureGrade === 'B' ? 'text-blue-600' :
    data.security.postureGrade === 'C' ? 'text-amber-600' :
    'text-red-600';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security posture</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time overview of tenant security health, anomalies, and risk indicators.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4">
              <div className={`text-5xl font-bold ${gradeColor}`}>{data.security.postureGrade}</div>
              <div>
                <p className="text-sm font-medium">Posture score</p>
                <p className="text-2xl font-semibold tabular-nums">{data.security.postureScore}/100</p>
                <p className="text-xs text-muted-foreground">MFA coverage, failed logins, denied actions, account state</p>
              </div>
            </div>
            <div className="flex-1 min-w-[200px] max-w-md">
              <Progress value={data.security.postureScore} className="h-3" />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>F (0)</span><span>D (40)</span><span>C (60)</span><span>B (75)</span><span>A (90)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total users" value={data.users.total} sub={`${data.users.active} active`} />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="MFA coverage"
          value={`${data.users.mfaCoverage}%`}
          sub={`${data.users.mfaEnabled} enabled / ${data.users.mfaDisabled} without`}
          accent={data.users.mfaCoverage >= 80 ? 'text-emerald-600' : 'text-amber-600'}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Failed logins (24h)"
          value={data.security.failedLogins24h}
          sub="Authentication denials"
          accent={data.security.failedLogins24h > 20 ? 'text-red-600' : 'text-emerald-600'}
        />
        <StatCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Denied actions (24h)"
          value={data.security.deniedActions24h}
          sub="Authorization denials"
          accent={data.security.deniedActions24h > 50 ? 'text-red-600' : 'text-emerald-600'}
        />
        <StatCard icon={<KeyRound className="h-4 w-4" />} label="Active API keys" value={data.security.apiKeysActive} sub="Not revoked" />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Audit events (24h)" value={data.security.auditEvents24h} sub="All event types" />
        <StatCard icon={<FileLock className="h-4 w-4" />} label="Highly Sensitive docs" value={data.documents.highlySensitive} sub="HS classification" accent="text-red-600" />
        <StatCard icon={<FileLock className="h-4 w-4" />} label="Restricted docs" value={data.documents.restricted} sub="Restricted classification" accent="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Top denied actors (24h)
            </CardTitle>
            <CardDescription>Users with highest deny counts — investigate if unexpected</CardDescription>
          </CardHeader>
          <CardContent>
            {data.anomalies.topDeniedActors?.length ? (
              <div className="space-y-2">
                {data.anomalies.topDeniedActors.map((a: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="font-mono">{a.email || 'unknown'}</span>
                    <Badge variant={a.denyCount > 20 ? 'destructive' : 'secondary'}>{a.denyCount}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No denials in the last 24h.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Recent failed logins
            </CardTitle>
            <CardDescription>Last 10 authentication failures</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.anomalies.recentFailedLogins?.length ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-900 max-h-72 overflow-y-auto">
                {data.anomalies.recentFailedLogins.map((l: any, i: number) => (
                  <div key={i} className="p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{l.actorEmail || 'unknown'}</span>
                      <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(l.createdAt), { addSuffix: true })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">IP: {l.actorIp || 'unknown'} · {l.reason || 'invalid credentials'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No failed logins recently.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            <Shield className="inline h-3 w-3 mr-1" />
            Posture is computed from observable signals and is advisory. Configure external monitoring
            (SIEM, log forwarding) for production-grade anomaly detection.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: any; sub?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span className={accent || 'text-muted-foreground'}>{icon}</span>
        </div>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
