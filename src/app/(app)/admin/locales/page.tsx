'use client';

/**
 * Smart EDMS — Translation management admin page
 *
 * Enterprise-grade UI for managing per-tenant translation overrides:
 *   - View all translation entries (filterable by locale, namespace, status)
 *   - Create/edit/delete translation overrides
 *   - Approve translations (draft → reviewed → approved workflow)
 *   - Filter by review status
 *   - Inline edit with save/cancel
 *
 * Overrides stored in the `LocaleResource` Prisma model supplement the
 * static JSON files in /messages/. When a translation key is looked up,
 * the system checks LocaleResource first, then falls back to the JSON.
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
import { Globe, BookOpen, CheckCircle2, Loader2, Languages, Plus, Trash2, Save, Eye, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useI18n } from '@/i18n/use-i18n';
import { locales, localeNames, localeFlags } from '@/i18n/config';
import Link from 'next/link';

interface TranslationEntry {
  id: string;
  locale: string;
  namespace: string;
  key: string;
  value: string;
  reviewStatus: string;
  updatedBy: string | null;
  updatedAt: string;
  version: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'secondary',
  reviewed: 'default',
  approved: 'default',
};

export default function AdminLocalesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterLocale, setFilterLocale] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [createForm, setCreateForm] = useState({
    locale: 'ar',
    namespace: 'common',
    key: '',
    value: '',
  });

  // Load translation overrides from DB
  const { data: transData, isLoading } = useQuery<{ items: TranslationEntry[] }>({
    queryKey: ['admin-translations'],
    queryFn: () => api.get('/api/admin/translations'),
  });

  // Load translation status (key counts per locale)
  const { data: statusData } = useQuery<any>({
    queryKey: ['translation-status'],
    queryFn: async () => {
      const results: any = {};
      for (const locale of locales) {
        try {
          const res = await fetch(`/api/translations/${locale}`);
          if (res.ok) {
            const data = await res.json();
            results[locale] = Object.keys(JSON.stringify(data).match(/"([^"]+)":/g) || []).length;
          }
        } catch {}
      }
      return results;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/admin/translations', { ...createForm, reviewStatus: 'draft' }),
    onSuccess: () => {
      toast({ title: 'Translation override created' });
      qc.invalidateQueries({ queryKey: ['admin-translations'] });
      setCreateOpen(false);
      setCreateForm({ locale: 'ar', namespace: 'common', key: '', value: '' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      api.patch(`/api/admin/translations/${id}`, { value, reviewStatus: 'reviewed' }),
    onSuccess: () => {
      toast({ title: 'Translation updated' });
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['admin-translations'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/admin/translations/${id}`, { reviewStatus: 'approved' }),
    onSuccess: () => {
      toast({ title: 'Translation approved' });
      qc.invalidateQueries({ queryKey: ['admin-translations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/translations/${id}`),
    onSuccess: () => {
      toast({ title: 'Translation deleted' });
      qc.invalidateQueries({ queryKey: ['admin-translations'] });
    },
  });

  // Filter entries
  const filteredEntries = (transData?.items || []).filter((e) => {
    if (filterLocale !== 'all' && e.locale !== filterLocale) return false;
    if (filterStatus !== 'all' && e.reviewStatus !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Languages className="h-6 w-6" /> {t('admin.locales')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage enabled languages, translation overrides, and terminology.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="me-2 h-4 w-4" /> New override</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create translation override</DialogTitle>
              <DialogDescription>
                Overrides supplement the static JSON files. Use for tenant-specific terminology or corrections.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Locale</Label>
                  <Select value={createForm.locale} onValueChange={(v) => setCreateForm({ ...createForm, locale: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {locales.map((l) => (
                        <SelectItem key={l} value={l}>{localeFlags[l]} {localeNames[l]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Namespace</Label>
                  <Input value={createForm.namespace} onChange={(e) => setCreateForm({ ...createForm, namespace: e.target.value })} placeholder="common, auth, documents…" dir="ltr" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Key</Label>
                <Input value={createForm.key} onChange={(e) => setCreateForm({ ...createForm, key: e.target.value })} placeholder="appName, signIn,…" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>Value</Label>
                <Textarea value={createForm.value} onChange={(e) => setCreateForm({ ...createForm, value: e.target.value })} rows={3} dir="auto" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!createForm.key || !createForm.value || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Create override
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Locale status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {locales.map((locale) => (
          <Card key={locale}>
            <CardContent className="py-3 flex items-center gap-3">
              <span className="text-2xl">{localeFlags[locale]}</span>
              <div>
                <p className="text-sm font-medium">{localeNames[locale]}</p>
                <p className="text-xs text-muted-foreground">{statusData?.[locale] || '—'} keys</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Translation overrides table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Translation Overrides
          </CardTitle>
          <CardDescription>
            Tenant-specific translation overrides. These take precedence over the static JSON files.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Filters */}
          <div className="flex items-center gap-2 p-3 border-b">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterLocale} onValueChange={setFilterLocale}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Locale" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locales</SelectItem>
                {locales.map((l) => (
                  <SelectItem key={l} value={l}>{localeFlags[l]} {localeNames[l]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : filteredEntries.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No translation overrides. Click "New override" to create one.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {filteredEntries.map((entry) => (
                <div key={entry.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className="text-xs font-mono">{localeFlags[entry.locale as keyof typeof localeFlags]} {entry.locale}</Badge>
                        <Badge variant="outline" className="text-xs font-mono">{entry.namespace}.{entry.key}</Badge>
                        <Badge variant={(STATUS_COLORS[entry.reviewStatus] as any) || 'secondary'} className="text-xs capitalize">{entry.reviewStatus}</Badge>
                      </div>
                      {editingId === entry.id ? (
                        <div className="space-y-2 mt-2">
                          <Textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            rows={2}
                            dir={entry.locale === 'ar' ? 'rtl' : 'ltr'}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => updateMutation.mutate({ id: entry.id, value: editValue })} disabled={updateMutation.isPending}>
                              <Save className="me-1 h-3 w-3" /> Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm" dir={entry.locale === 'ar' ? 'rtl' : 'ltr'}>{entry.value}</p>
                      )}
                    </div>
                    {editingId !== entry.id && (
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => { setEditingId(entry.id); setEditValue(entry.value); }}
                        >
                          Edit
                        </Button>
                        {entry.reviewStatus !== 'approved' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-green-600"
                            onClick={() => approveMutation.mutate(entry.id)}
                          >
                            <CheckCircle2 className="me-1 h-3 w-3" /> Approve
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-600"
                          onClick={() => deleteMutation.mutate(entry.id)}
                        >
                          <Trash2 className="me-1 h-3 w-3" /> Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Glossary link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bilingual Glossary</CardTitle>
          <CardDescription>Canonical terminology for English ↔ Arabic</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="https://github.com/ahmedkobbi/smart-edms/blob/main/docs/GLOSSARY-EN-AR.md" target="_blank">
            <Button variant="outline" size="sm">
              <BookOpen className="me-2 h-3.5 w-3.5" /> View Glossary
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
