'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Loader2, LogOut, Monitor } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

export default function SessionsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ sessions: any[] }>({
    queryKey: ['sessions'],
    queryFn: () => api.get('/api/sessions'),
  });

  const revokeAll = useMutation({
    mutationFn: () => api.delete('/api/sessions'),
    onSuccess: (res: any) => {
      toast({ title: 'Sessions revoked', description: res.message });
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('admin.sessions')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recent authentication events for your account. To force-terminate all sessions, change your password.
        </p>
      </div>

      <Card className="glass-card border-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Recent logins</CardTitle>
            <CardDescription>Based on audit events</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => revokeAll.mutate()} disabled={revokeAll.isPending}>
            <LogOut className="mr-2 h-3.5 w-3.5" /> Revoke all others
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.sessions?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No recent sessions found.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.sessions.map((s: any, i: number) => (
                <div key={s.id} className="p-4 flex items-start gap-3">
                  <Monitor className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{s.userAgent?.includes('Mobile') ? 'Mobile' : 'Desktop'}</span>
                      {i === 0 && <Badge variant="default" className="text-xs">Most recent</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      IP: {s.ip || 'unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.userAgent?.slice(0, 80)}…
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(s.lastActivity), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
