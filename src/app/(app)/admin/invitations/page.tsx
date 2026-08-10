'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Mail, Loader2, Plus, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/i18n/use-i18n';

const SYSTEM_ROLES = ['tenant_admin', 'records_manager', 'security_officer', 'compliance_auditor', 'end_user', 'viewer'];

export default function AdminInvitationsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', roleNames: ['end_user'] });

  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ['admin-invitations'],
    queryFn: () => api.get('/api/admin/invitations'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/invitations', form),
    onSuccess: (res: any) => {
      setInviteUrl(res.inviteUrl);
      qc.invalidateQueries({ queryKey: ['admin-invitations'] });
      setForm({ email: '', roleNames: ['end_user'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.invitations')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invite new users. Each invitation generates a secure one-time URL.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setInviteUrl(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New invitation</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{inviteUrl ? 'Invitation created' : 'Invite user'}</DialogTitle>
              <DialogDescription>
                {inviteUrl ? 'Copy this URL and deliver it to the recipient securely. Expires in 7 days.' : 'Send an invitation to a new user.'}
              </DialogDescription>
            </DialogHeader>
            {inviteUrl ? (
              <div className="space-y-3 py-2">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
                  <p className="font-mono text-xs break-all">{inviteUrl}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(inviteUrl); toast({ title: 'Copied' }); }}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy URL
                </Button>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Roles</Label>
                  <div className="space-y-1">
                    {SYSTEM_ROLES.map((r) => (
                      <label key={r} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={form.roleNames.includes(r)}
                          onChange={(e) => {
                            if (e.target.checked) setForm({ ...form, roleNames: [...form.roleNames, r] });
                            else setForm({ ...form, roleNames: form.roleNames.filter((x) => x !== r) });
                          }}
                        />
                        <span className="font-mono">{r}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              {inviteUrl ? (
                <Button onClick={() => { setCreateOpen(false); setInviteUrl(null); }}>Done</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={() => create.mutate()} disabled={!form.email || create.isPending}>
                    {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Invitations</CardTitle>
          <CardDescription>Pending, accepted, and expired</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !data?.items?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No invitations sent.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {data.items.map((inv: any) => (
                <div key={inv.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{inv.email}</p>
                      <Badge variant={inv.status === 'accepted' ? 'default' : inv.status === 'pending' ? 'secondary' : 'outline'} className="text-xs">{inv.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Invited {formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}
                      {inv.expiresAt && ` · expires ${formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}`}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {JSON.parse(inv.roleNames || '[]').map((r: string) => (
                        <Badge key={r} variant="outline" className="text-[10px] py-0 font-mono">{r}</Badge>
                      ))}
                    </div>
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
