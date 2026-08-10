'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Globe, BookOpen, CheckCircle2, Loader2, Languages } from 'lucide-react';
import { locales, localeNames, localeFlags } from '@/i18n/config';
import Link from 'next/link';

export default function AdminLocalesPage() {
  const { data: transData, isLoading } = useQuery<any>({
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Languages className="h-6 w-6" /> Locale &amp; Translation Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage enabled languages, review translation status, and maintain terminology.
        </p>
      </div>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" /> Enabled Locales
          </CardTitle>
          <CardDescription>Languages available for users in this tenant</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {locales.map((locale) => (
              <div key={locale} className="flex items-center justify-between p-3 rounded-lg glass-card border-0">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{localeFlags[locale]}</span>
                  <div>
                    <p className="text-sm font-medium">{localeNames[locale]}</p>
                    <p className="text-xs text-muted-foreground font-mono">{locale}</p>
                  </div>
                </div>
                <Badge variant="default" className="text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Active
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Translation Status
          </CardTitle>
          <CardDescription>Key count per locale (run check:translations in CI for completeness)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {locales.map((locale) => (
                <div key={locale} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{localeFlags[locale]}</span>
                    <span className="text-sm font-medium">{localeNames[locale]}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {transData?.[locale] || '—'} keys
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base">Bilingual Glossary</CardTitle>
          <CardDescription>Canonical terminology for English ↔ Arabic</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="https://github.com/ahmedkobbi/smart-edms/blob/main/docs/GLOSSARY-EN-AR.md" target="_blank">
            <Button variant="outline" size="sm">
              <BookOpen className="mr-2 h-3.5 w-3.5" /> View Glossary
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
