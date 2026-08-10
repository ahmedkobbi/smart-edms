'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CreditCard, Loader2, HardDrive, Users, FileText } from 'lucide-react';
import { formatBytes } from '@/lib/utils/format';
import { useI18n } from '@/i18n/use-i18n';

export default function AdminBillingPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery<any>({
    queryKey: ['admin-billing'],
    queryFn: () => api.get('/api/admin/billing'),
  });

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const sub = data.subscription;
  const usage = data.usage;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.billing')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Plan, seats, storage usage, and subscription status.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current plan</p>
                <p className="text-2xl font-semibold capitalize">{sub.plan}</p>
                <Badge variant={sub.status === 'active' ? 'default' : sub.status === 'trialing' ? 'secondary' : 'destructive'} className="text-xs capitalize mt-1">
                  {sub.status}
                </Badge>
              </div>
            </div>
            <div className="text-end">
              <p className="text-xs text-muted-foreground">Period</p>
              <p className="text-sm font-medium">
                {sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleDateString() : '—'}
                {' → '}
                {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Seats</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">{usage.seats} / {usage.seatsLimit}</p>
            <Progress value={(usage.seats / usage.seatsLimit) * 100} className="h-1.5 mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Documents</p>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">{usage.documents}</p>
            <p className="text-xs text-muted-foreground mt-1">No document limit</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Storage</p>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">{formatBytes(usage.storageUsedBytes)} / {formatBytes(usage.storageLimitBytes)}</p>
            <Progress value={usage.storageUsedPct} className="h-1.5 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">{usage.storageUsedPct}% used</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan details</CardTitle>
          <CardDescription>Configure your subscription (in production, this would integrate with Stripe)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium capitalize">{sub.plan}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium capitalize">{sub.status}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Seats included</span><span className="font-medium">{sub.seats}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Storage limit</span><span className="font-medium">{formatBytes(sub.storageBytes)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Subscription ID</span><span className="font-mono text-xs">{sub.id}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
