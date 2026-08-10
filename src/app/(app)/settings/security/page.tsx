'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { SecuritySection } from '../security-section';
import { useI18n } from '@/i18n/use-i18n';

export default function SettingsSecurityPage() {
  const { t } = useI18n();
  const { data } = useQuery<any>({
    queryKey: ['me'],
    queryFn: () => api.get('/api/me'),
  });
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.security')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Multi-factor authentication, password, and session management.
        </p>
      </div>
      <SecuritySection mfaEnabled={data?.user?.mfaEnabled ?? false} />
    </div>
  );
}
