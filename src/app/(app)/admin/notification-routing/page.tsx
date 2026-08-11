'use client';

/**
 * Smart EDMS — Notification routing admin page
 *
 * Allows tenant admins to configure how notifications are delivered
 * based on severity + type. Rules are evaluated in priority order;
 * the first match determines the delivery channels.
 *
 * Example rules:
 *   - "Critical security alerts → email all tenant admins"
 *   - "Workflow reminders → in-app only"
 *   - "Policy violations → email + in-app security officers"
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Bell, Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';

const SEVERITY_LEVELS: Record<string, number> = { info: 0, success: 1, warning: 2, critical: 3 };

export default function NotificationRoutingPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    minSeverity: 'warning' as 'info' | 'success' | 'warning' | 'critical',
    typePattern: '*',
    channels: ['in_app'] as string[],
    targetRoles: [] as string[],
    priority: '100',
  });
  const [rolesInput, setRolesInput] = useState('');

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['notification-routing'],
    queryFn: () => api.get('/api/admin/notification-routing'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/notification-routing', {
      ...form,
      priority: parseInt(form.priority, 10),
      targetRoles: rolesInput.split(',').map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      toast({ title: 'Routing rule created' });
      qc.invalidateQueries({ queryKey: ['notification-routing'] });
      setCreateOpen(false);
      setForm({ name: '', minSeverity: 'warning', typePattern: '*', channels: ['in_app'], targetRoles: [], priority: '100' });
      setRolesInput('');
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/notification-routing/${id}`),
    onSuccess: () => {
      toast({ title: 'Routing rule deleted' });
      qc.invalidateQueries({ queryKey: ['notification-routing'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/admin/notification-routing/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-routing'] }),
  });

  const toggleChannel = (channel: string) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notification Routing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure how notifications are delivered based on severity and type.
            Rules are evaluated in priority order (highest first).
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> New rule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create routing rule</DialogTitle>
              <DialogDescription>
                Rules determine which delivery channels are used for notifications
                matching the severity + type pattern.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Critical alerts → email admins" dir="auto" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Minimum severity</Label>
                  <Select value={form.minSeverity} onValueChange={(v) => setForm({ ...form, minSeverity: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info+</SelectItem>
                      <SelectItem value="success">Success+</SelectItem>
                      <SelectItem value="warning">Warning+</SelectItem>
                      <SelectItem value="critical">Critical only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Priority (higher = first)</Label>
                  <Input type="number" min="0" max="1000" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Type pattern</Label>
                <Input value={form.typePattern} onChange={(e) => setForm({ ...form, typePattern: e.target.value })} placeholder="security.*, workflow.*, or *" dir="auto" />
                <p className="text-xs text-muted-foreground">Use <code>*</code> for all types, or <code>security.*</code> for a category.</p>
              </div>
              <div className="space-y-1">
                <Label>Delivery channels</Label>
                <div className="flex gap-2">
                  {['in_app', 'email', 'webhook'].map((ch) => (
                    <Button
                      key={ch}
                      type="button"
                      variant={form.channels.includes(ch) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleChannel(ch)}
                    >
                      {ch === 'in_app' ? 'In-app' : ch === 'email' ? 'Email' : 'Webhook'}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Target roles (comma-separated, empty = original recipient)</Label>
                <Input value={rolesInput} onChange={(e) => setRolesInput(e.target.value)} placeholder="tenant_admin, security_officer" dir="auto" />
                <p className="text-xs text-muted-foreground">When set, notifications are delivered to all users with these roles instead of the original recipient.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name || form.channels.length === 0 || create.isPending}>
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Create rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" /> Routing Rules
          </CardTitle>
          <CardDescription>Evaluated in priority order. First match wins.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground mb-2">No routing rules defined.</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Without routing rules, all notifications are delivered in-app only.
                Create a rule to route critical alerts via email or webhook.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((r) => (
                <div key={r.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{r.name}</p>
                      <Badge variant="secondary" className="text-xs">Priority {r.priority}</Badge>
                      {!r.enabled && <Badge variant="outline" className="text-xs">Disabled</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge variant={r.minSeverity === 'critical' ? 'destructive' : r.minSeverity === 'warning' ? 'default' : 'secondary'} className="text-xs">
                        {r.minSeverity}+
                      </Badge>
                      <Badge variant="outline" className="text-xs font-mono">{r.typePattern}</Badge>
                      {r.channels.map((ch: string) => (
                        <Badge key={ch} variant="outline" className="text-xs">{ch}</Badge>
                      ))}
                      {r.targetRoles.length > 0 && (
                        <Badge variant="outline" className="text-xs">→ {r.targetRoles.join(', ')}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}>
                      {r.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => del.mutate(r.id)}>
                      <Trash2 className="me-1 h-3 w-3" /> Delete
                    </Button>
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
