'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code2, KeyRound, Webhook, Bot, Loader2, ExternalLink, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/i18n/use-i18n';

export default function DeveloperPage() {
  const { t } = useI18n();
  const { data: keys } = useQuery<{ items: any[] }>({
    queryKey: ['admin-api-keys'],
    queryFn: () => api.get('/api/admin/api-keys'),
  });

  const { data: webhooks } = useQuery<{ items: any[] }>({
    queryKey: ['admin-webhooks'],
    queryFn: () => api.get('/api/admin/webhooks'),
  });

  const { data: serviceAccounts } = useQuery<{ items: any[] }>({
    queryKey: ['admin-service-accounts'],
    queryFn: () => api.get('/api/admin/service-accounts'),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Code2 className="h-6 w-6" /> {t('admin.developer')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          API access, integrations, and developer resources.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card border-0 hover-lift">
          <CardContent className="p-4">
            <KeyRound className="h-5 w-5 text-blue-500 mb-2" />
            <p className="text-2xl font-semibold tabular-nums">{keys?.items?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">API Keys</p>
            <Link href="/admin/api-keys"><Button variant="ghost" size="sm" className="mt-2 text-xs">Manage →</Button></Link>
          </CardContent>
        </Card>
        <Card className="glass-card border-0 hover-lift">
          <CardContent className="p-4">
            <Bot className="h-5 w-5 text-purple-500 mb-2" />
            <p className="text-2xl font-semibold tabular-nums">{serviceAccounts?.items?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Service Accounts</p>
            <Link href="/admin/service-accounts"><Button variant="ghost" size="sm" className="mt-2 text-xs">Manage →</Button></Link>
          </CardContent>
        </Card>
        <Card className="glass-card border-0 hover-lift">
          <CardContent className="p-4">
            <Webhook className="h-5 w-5 text-emerald-500 mb-2" />
            <p className="text-2xl font-semibold tabular-nums">{webhooks?.items?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Webhooks</p>
            <Link href="/admin/webhooks"><Button variant="ghost" size="sm" className="mt-2 text-xs">Manage →</Button></Link>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4" /> Quickstart
          </CardTitle>
          <CardDescription>Authenticate and make your first API call</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">1. Create an API key</p>
            <p className="text-xs text-muted-foreground mb-2">Go to Admin → API Keys and create a key with the scopes you need.</p>
            <Link href="/admin/api-keys"><Button variant="outline" size="sm">Create API Key →</Button></Link>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">2. Make your first request</p>
            <div className="bg-slate-900 dark:bg-slate-950 rounded-lg p-3 overflow-x-auto scrollbar-premium">
              <pre className="text-xs font-mono text-slate-100"><code>{`curl -H "Authorization: Bearer se_your_key_here" \\
  https://app.smartedms.com/api/documents`}</code></pre>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">3. Upload a document</p>
            <div className="bg-slate-900 dark:bg-slate-950 rounded-lg p-3 overflow-x-auto scrollbar-premium">
              <pre className="text-xs font-mono text-slate-100"><code>{`curl -H "Authorization: Bearer se_your_key_here" \\
  -F "file=@document.pdf" \\
  -F "title=My Document" \\
  -F "classificationId=<classification_id>" \\
  https://app.smartedms.com/api/documents`}</code></pre>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base">Resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href="/api-docs" className="flex items-center justify-between p-3 rounded-lg glass-card border-0 hover-lift">
            <div>
              <p className="text-sm font-medium">API Documentation (Swagger)</p>
              <p className="text-xs text-muted-foreground">Interactive OpenAPI 3.1 spec for all endpoints</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link href="/api/openapi" className="flex items-center justify-between p-3 rounded-lg glass-card border-0 hover-lift">
            <div>
              <p className="text-sm font-medium">OpenAPI Spec (JSON)</p>
              <p className="text-xs text-muted-foreground">Raw spec for code generation</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
