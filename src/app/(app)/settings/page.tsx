'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSection } from './profile-section';
import { SecuritySection } from './security-section';
import { useI18n } from '@/i18n/use-i18n';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SettingsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const forced = searchParams.get('forced') === '1';
  const { data } = useQuery<any>({
    queryKey: ['me'],
    queryFn: () => api.get('/api/me'),
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('settings.subtitle')}
        </p>
      </div>

      {forced && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 border-2 border-amber-500/30 bg-amber-500/5"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-400">
                {t('auth.mustChangePasswordTitle')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('auth.mustChangePasswordDesc')}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <Tabs defaultValue={forced ? 'security' : 'profile'}>
        <TabsList>
          <TabsTrigger value="profile">{t('settings.profile')}</TabsTrigger>
          <TabsTrigger value="security">{t('settings.security')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileSection user={data?.user} tenant={data?.tenant} />
        </TabsContent>
        <TabsContent value="security">
          <SecuritySection mfaEnabled={data?.user?.mfaEnabled} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
