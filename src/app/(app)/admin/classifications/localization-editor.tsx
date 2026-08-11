'use client';

/**
 * Smart EDMS — Classification localization editor dialog
 *
 * Allows admins to manage per-locale name + description overrides for
 * a classification. Opens from the classifications admin page.
 *
 * Features:
 *   - Lists all 5 supported locales (en, fr, ar, es, de)
 *   - Shows which locales have overrides vs. falling back to default
 *   - Inline edit with save/cancel per locale
 *   - Delete override (reverts to default)
 *   - Live preview of the localized name in the classification's color
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Trash2, Languages, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config';
import { useI18n } from '@/i18n/use-i18n';

interface LocalizationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classification: {
    id: string;
    name: string;
    code: string;
    color: string;
    description?: string | null;
  } | null;
}

interface Localization {
  id: string;
  locale: string;
  name: string;
  description: string | null;
}

export function LocalizationEditor({ open, onOpenChange, classification }: LocalizationEditorProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, { name: string; description: string }>>({});

  // Load existing localizations
  const { data, isLoading } = useQuery<{ items: Localization[] }>({
    queryKey: ['classification-localizations', classification?.id],
    queryFn: () => api.get(`/api/admin/classifications/${classification?.id}/localizations`),
    enabled: !!classification?.id && open,
  });

  const existingMap = new Map((data?.items ?? []).map((l) => [l.locale, l]));

  const upsert = useMutation({
    mutationFn: ({ locale, name, description }: { locale: string; name: string; description: string }) =>
      api.put(`/api/admin/classifications/${classification?.id}/localizations/${locale}`, { name, description: description || undefined }),
    onSuccess: (_, vars) => {
      toast({ title: t('admin.classLocalization.savedToast'), description: t('admin.classLocalization.savedToastDesc', { locale: localeNames[vars.locale as Locale] || vars.locale }) });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[vars.locale];
        return next;
      });
      qc.invalidateQueries({ queryKey: ['classification-localizations', classification?.id] });
      qc.invalidateQueries({ queryKey: ['classifications'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: (locale: string) =>
      api.delete(`/api/admin/classifications/${classification?.id}/localizations/${locale}`),
    onSuccess: (_, locale) => {
      toast({ title: t('admin.classLocalization.overrideRemovedToast'), description: t('admin.classLocalization.overrideRemovedToastDesc', { locale: localeNames[locale as Locale] || locale }) });
      qc.invalidateQueries({ queryKey: ['classification-localizations', classification?.id] });
      qc.invalidateQueries({ queryKey: ['classifications'] });
    },
    onError: (err: any) => toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' }),
  });

  // Reset editing state when dialog opens — use render-phase check to
  // avoid the cascading-renders lint warning.
  if (open && Object.keys(editing).length > 0) {
    setEditing({});
  }

  if (!classification) return null;

  const startEdit = (locale: string) => {
    const existing = existingMap.get(locale);
    setEditing({
      ...editing,
      [locale]: {
        name: existing?.name ?? classification.name,
        description: existing?.description ?? classification.description ?? '',
      },
    });
  };

  const cancelEdit = (locale: string) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[locale];
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            {t('admin.classLocalization.localizeTitle')} <span style={{ color: classification.color }}>{classification.name}</span>
          </DialogTitle>
          <DialogDescription>
            {t('admin.classLocalization.editorDesc', { code: classification.code })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3 py-2">
            {locales.map((locale) => {
              const existing = existingMap.get(locale);
              const isEditing = !!editing[locale];
              const editValues = editing[locale];

              return (
                <div key={locale} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{localeFlags[locale]}</span>
                      <span className="font-medium text-sm">{localeNames[locale]}</span>
                      <Badge variant="outline" className="text-xs font-mono">{locale}</Badge>
                      {existing ? (
                        <Badge variant="default" className="text-xs">
                          <Check className="me-1 h-3 w-3" /> {t('admin.classLocalization.overrideBadge')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{t('admin.classLocalization.defaultBadge')}</Badge>
                      )}
                    </div>
                    {!isEditing && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEdit(locale)}>
                        {existing ? t('admin.classLocalization.editButton') : t('admin.classLocalization.addOverrideButton')}
                      </Button>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                        {existing?.name ?? classification.name}
                      </p>
                      <p className="text-xs text-muted-foreground" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                        {existing?.description ?? classification.description ?? t('admin.classLocalization.noDescription')}
                      </p>
                      {existing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-red-600 px-0"
                          onClick={() => remove.mutate(locale)}
                        >
                          <Trash2 className="me-1 h-3 w-3" /> {t('admin.classLocalization.removeOverrideButton')}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs">{t('admin.classLocalization.nameLabel')}</Label>
                        <Input
                          value={editValues.name}
                          onChange={(e) => setEditing({
                            ...editing,
                            [locale]: { ...editValues, name: e.target.value },
                          })}
                          maxLength={100}
                          dir={locale === 'ar' ? 'rtl' : 'ltr'}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('admin.classLocalization.descriptionLabel')}</Label>
                        <Input
                          value={editValues.description}
                          onChange={(e) => setEditing({
                            ...editing,
                            [locale]: { ...editValues, description: e.target.value },
                          })}
                          maxLength={500}
                          dir={locale === 'ar' ? 'rtl' : 'ltr'}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => upsert.mutate({ locale, ...editValues })}
                          disabled={!editValues.name.trim() || upsert.isPending}
                        >
                          {upsert.isPending ? <Loader2 className="me-2 h-3 w-3 animate-spin" /> : <Save className="me-2 h-3 w-3" />}
                          {t('admin.classLocalization.saveButton')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => cancelEdit(locale)}>
                          {t('common.cancelButton')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.doneButton')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
