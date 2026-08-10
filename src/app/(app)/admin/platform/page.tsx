'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { GlassCard } from '@/components/ui/premium';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Users, FileText, CreditCard, AlertTriangle, TrendingUp, HardDrive, Globe, Loader2, Ban, CheckCircle2, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatBytes } from '@/lib/utils/format';
import { formatDistanceToNow } from 'date-fns';

export default function PlatformDashboardPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['platform-tenants', page],
    queryFn: () => api.get(`/api/admin/tenants?page=${page}&pageSize=20`),
  });

  const suspendTenant = useMutation({
    mutationFn: ({ tenantId, action }: { tenantId: string; action: 'active' | 'suspended' }) =>
      api.patch(`/api/admin/tenants/${tenantId}`, { status: action }),
    onSuccess: (_, vars) => {
      toast({ title: vars.action === 'suspended' ? 'Tenant suspended' : 'Tenant activated' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const tenants = data?.items || [];
  const total = data?.total || 0;

  // Compute aggregate stats
  const totalUsers = tenants.reduce((sum: number, t: any) => sum + (t._count?.users || 0), 0);
  const totalDocs = tenants.reduce((sum: number, t: any) => sum + (t._count?.documents || 0), 0);
  const activeTenants = tenants.filter((t: any) => t.status === 'active').length;
  const suspendedTenants = tenants.filter((t: any) => t.status === 'suspended').length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Globe className="h-6 w-6" /> Platform Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cross-tenant overview — {total} tenants, {activeTenants} active, {suspendedTenants} suspended
        </p>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Total Tenants" value={total} color="from-blue-500 to-indigo-600" />
        <StatCard icon={Users} label="Total Users" value={totalUsers} color="from-green-500 to-emerald-600" />
        <StatCard icon={FileText} label="Total Documents" value={totalDocs} color="from-amber-500 to-orange-600" />
        <StatCard icon={AlertTriangle} label="Suspended" value={suspendedTenants} color="from-red-500 to-rose-600" />
      </div>

      {/* Tenant list */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">All Tenants</h3>
          <Badge variant="outline" className="text-xs">{total} total</Badge>
        </div>

        {tenants.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No tenants found.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {tenants.map((tenant: any) => (
              <div key={tenant.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{tenant.name}</p>
                    <Badge
                      variant={tenant.status === 'active' ? 'default' : tenant.status === 'suspended' ? 'destructive' : 'outline'}
                      className="text-xs capitalize"
                    >
                      {tenant.status}
                    </Badge>
                    {tenant.subscription && (
                      <Badge variant="secondary" className="text-xs capitalize">{tenant.subscription.plan}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tenant.slug} · {tenant._count?.users || 0} users · {tenant._count?.documents || 0} docs · created {formatDistanceToNow(new Date(tenant.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {tenant.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-amber-600"
                      onClick={() => suspendTenant.mutate({ tenantId: tenant.id, action: 'suspended' })}
                      disabled={suspendTenant.isPending}
                    >
                      <Ban className="h-3.5 w-3.5 me-1" /> Suspend
                    </Button>
                  ) : tenant.status === 'suspended' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-green-600"
                      onClick={() => suspendTenant.mutate({ tenantId: tenant.id, action: 'active' })}
                      disabled={suspendTenant.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 me-1" /> Activate
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data?.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t mt-2">
            <p className="text-xs text-muted-foreground">Page {data.page} of {data.totalPages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={data.page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold">{value.toLocaleString()}</p>
        </div>
      </div>
    </GlassCard>
  );
}
