'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Globe, Clock, Calendar, Type } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { locales, localeNames, localeFlags } from '@/i18n/config';

export default function LocalePreferencesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: prefs, isLoading } = useQuery<any>({
    queryKey: ['locale-prefs'],
    queryFn: () => api.get('/api/me/locale'),
  });

  const save = useMutation({
    mutationFn: (data: any) => api.patch('/api/me/locale', data),
    onSuccess: () => {
      toast({ title: 'Preferences saved' });
      qc.invalidateQueries({ queryKey: ['locale-prefs'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading || !prefs) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const p = prefs.preferences;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Language &amp; Locale</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your preferred language, timezone, calendar, and formatting.
        </p>
      </div>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" /> Language
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Interface language</Label>
            <Select
              value={p.locale}
              onValueChange={(v) => save.mutate({ locale: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {locales.map((l) => (
                  <SelectItem key={l} value={l}>
                    {localeFlags[l]} {localeNames[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Changing language will reload the page to apply RTL/LTR direction.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Text direction</p>
              <p className="text-xs text-muted-foreground">
                {p.direction === 'rtl' ? 'Right-to-left (Arabic)' : 'Left-to-right'}
              </p>
            </div>
            <Switch
              checked={p.direction === 'rtl'}
              onCheckedChange={(checked) => save.mutate({ direction: checked ? 'rtl' : 'ltr' })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Timezone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label>Timezone</Label>
            <Select
              value={p.timezone}
              onValueChange={(v) => save.mutate({ timezone: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['UTC', 'Africa/Algiers', 'Africa/Cairo', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles'].map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label>Calendar system</Label>
            <Select
              value={p.calendar}
              onValueChange={(v) => save.mutate({ calendar: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gregory">Gregorian</SelectItem>
                <SelectItem value="islamic-umalqura">Islamic (Umm al-Qura)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Islamic calendar displays Hijri dates alongside Gregorian.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Type className="h-4 w-4" /> Formatting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label>Number format</Label>
            <Select
              value={p.numberFormat}
              onValueChange={(v) => save.mutate({ numberFormat: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en-US">English (1,234.56)</SelectItem>
                <SelectItem value="ar-SA">Arabic (١٬٢٣٤٫٥٦)</SelectItem>
                <SelectItem value="fr-FR">French (1 234,56)</SelectItem>
                <SelectItem value="de-DE">German (1.234,56)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
