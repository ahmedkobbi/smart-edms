'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { applyBranding, DEFAULT_BRANDING, type BrandingConfig } from '@/lib/branding/branding-config';

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery<{ tenant?: { settings?: { branding?: BrandingConfig } } }>({
    queryKey: ['tenant-branding'],
    queryFn: () => api.get('/api/admin/tenant'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  useEffect(() => {
    const branding = data?.tenant?.settings?.branding;
    if (branding) {
      applyBranding({ ...DEFAULT_BRANDING, ...branding });
    }
  }, [data]);

  return <>{children}</>;
}
