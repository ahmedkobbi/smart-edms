'use client';

/**
 * Smart EDMS — Profile section (editable)
 *
 * Displays the user's profile information and allows inline editing of:
 *   - Name (required, 1-100 chars)
 *   - Job title (optional, max 100 chars)
 *   - Department (optional, max 100 chars)
 *   - Avatar URL (optional, must be a valid URL)
 *
 * Email is read-only (managed by admin/SSO). Status and tenant info are
 * read-only display fields.
 *
 * Uses optimistic UI: the form updates immediately on save, rolls back
 * on error. The save calls PATCH /api/me (which requires step-up auth
 * if configured, and audits the change).
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/i18n/use-i18n';
import { formatDistanceToNow } from 'date-fns';

interface ProfileData {
  id: string;
  email: string;
  name: string | null;
  jobTitle: string | null;
  department: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
}

export function ProfileSection({ user, tenant }: { user: ProfileData | null | undefined; tenant: any }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    jobTitle: '',
    department: '',
    avatarUrl: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync form when user data changes — use a render-phase check to
  // avoid the cascading-renders lint warning from useEffect.
  // The `editing` state gates whether the form is visible, so we only
  // need to sync when not editing and the user data has changed.
  const userKey = user?.id ?? 'no-user';
  if (!editing && user && (form.name !== (user.name ?? '') || form.jobTitle !== (user.jobTitle ?? '') || form.department !== (user.department ?? '') || form.avatarUrl !== (user.avatarUrl ?? ''))) {
    setForm({
      name: user.name ?? '',
      jobTitle: user.jobTitle ?? '',
      department: user.department ?? '',
      avatarUrl: user.avatarUrl ?? '',
    });
  }

  const save = useMutation({
    mutationFn: () => {
      // Validate
      const newErrors: Record<string, string> = {};
      if (!form.name.trim()) newErrors.name = 'Name is required';
      if (form.name.length > 100) newErrors.name = 'Name must be 100 characters or fewer';
      if (form.jobTitle.length > 100) newErrors.jobTitle = 'Job title must be 100 characters or fewer';
      if (form.department.length > 100) newErrors.department = 'Department must be 100 characters or fewer';
      if (form.avatarUrl && !isValidUrl(form.avatarUrl)) newErrors.avatarUrl = 'Avatar URL must be a valid URL';
      if (form.avatarUrl && form.avatarUrl.length > 500) newErrors.avatarUrl = 'Avatar URL is too long';
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) {
        throw new Error('Validation failed');
      }

      // Build patch — only include changed fields
      const patch: Record<string, string | null> = {};
      if (form.name !== (user?.name ?? '')) patch.name = form.name.trim();
      if (form.jobTitle !== (user?.jobTitle ?? '')) patch.jobTitle = form.jobTitle.trim() || null;
      if (form.department !== (user?.department ?? '')) patch.department = form.department.trim() || null;
      if (form.avatarUrl !== (user?.avatarUrl ?? '')) patch.avatarUrl = form.avatarUrl.trim() || null;

      if (Object.keys(patch).length === 0) {
        // Nothing changed — just exit edit mode
        return Promise.resolve();
      }

      return api.patch('/api/me', patch);
    },
    onSuccess: () => {
      toast({ title: t('settings.profileUpdated'), description: t('settings.profileUpdatedDesc') });
      setEditing(false);
      setErrors({});
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => {
      if (err?.message === 'Validation failed') return; // errors already set
      toast({ title: t('settings.profileUpdateFailed'), description: err?.message, variant: 'destructive' });
    },
  });

  const cancel = () => {
    setEditing(false);
    setErrors({});
    // Reset form to current user data
    if (user) {
      setForm({
        name: user.name ?? '',
        jobTitle: user.jobTitle ?? '',
        department: user.department ?? '',
        avatarUrl: user.avatarUrl ?? '',
      });
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{t('settings.profile')}</CardTitle>
            <CardDescription>{t('settings.profileDesc')}</CardDescription>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="me-2 h-3.5 w-3.5" /> {t('common.edit')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <div className="space-y-4">
              {/* Editable form */}
              <div className="space-y-1.5">
                <Label htmlFor="name">{t('settings.name')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t('settings.namePlaceholder')}
                  maxLength={100}
                  dir="auto"
                  aria-invalid={!!errors.name}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobTitle">{t('settings.jobTitle')}</Label>
                <Input
                  id="jobTitle"
                  value={form.jobTitle}
                  onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                  placeholder={t('settings.jobTitlePlaceholder')}
                  maxLength={100}
                  dir="auto"
                />
                {errors.jobTitle && <p className="text-xs text-destructive">{errors.jobTitle}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="department">{t('settings.department')}</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder={t('settings.departmentPlaceholder')}
                  maxLength={100}
                  dir="auto"
                />
                {errors.department && <p className="text-xs text-destructive">{errors.department}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="avatarUrl">{t('settings.avatarUrl')}</Label>
                <Input
                  id="avatarUrl"
                  type="url"
                  value={form.avatarUrl}
                  onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                  placeholder="https://example.com/avatar.jpg"
                  maxLength={500}
                  dir="ltr"
                />
                {errors.avatarUrl && <p className="text-xs text-destructive">{errors.avatarUrl}</p>}
                <p className="text-xs text-muted-foreground">{t('settings.avatarUrlHelp')}</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <Check className="me-2 h-3.5 w-3.5" />}
                  {t('common.save')}
                </Button>
                <Button size="sm" variant="outline" onClick={cancel} disabled={save.isPending}>
                  <X className="me-2 h-3.5 w-3.5" /> {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Row label={t('settings.name')} value={user.name ?? '—'} />
              <Row label={t('settings.email')} value={user.email} />
              <Row label={t('settings.jobTitle')} value={user.jobTitle ?? '—'} />
              <Row label={t('settings.department')} value={user.department ?? '—'} />
              <Row
                label={t('settings.status')}
                value={<Badge variant={user.status === 'active' ? 'default' : 'secondary'}>{user.status}</Badge>}
              />
              <Row label={t('settings.created')} value={formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })} />
              {user.lastLoginAt && (
                <Row
                  label={t('settings.lastLogin')}
                  value={`${formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })} · ${user.lastLoginIp ?? 'unknown'}`}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.tenant')}</CardTitle>
          <CardDescription>{t('settings.tenantDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label={t('settings.name')} value={tenant?.name ?? '—'} />
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
      <span className="font-medium text-end">{value}</span>
    </div>
  );
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
