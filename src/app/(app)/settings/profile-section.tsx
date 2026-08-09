'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export function ProfileSection({ user, tenant }: { user: any; tenant: any }) {
  if (!user) return null;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your account information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Name" value={user.name ?? '—'} />
          <Row label="Email" value={user.email} />
          <Row label="Job title" value={user.jobTitle ?? '—'} />
          <Row label="Department" value={user.department ?? '—'} />
          <Row label="Status" value={<Badge variant={user.status === 'active' ? 'default' : 'secondary'}>{user.status}</Badge>} />
          <Row label="Created" value={formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })} />
          {user.lastLoginAt && (
            <Row label="Last login" value={`${formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })} from ${user.lastLoginIp ?? 'unknown'}`} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenant</CardTitle>
          <CardDescription>The organization this account belongs to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Name" value={tenant?.name ?? '—'} />
          <Row label="Slug" value={<span className="font-mono text-sm">{tenant?.slug ?? '—'}</span>} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
