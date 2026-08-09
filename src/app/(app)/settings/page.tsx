'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSection } from './profile-section';
import { SecuritySection } from './security-section';

export default function SettingsPage() {
  const { data } = useQuery<any>({
    queryKey: ['me'],
    queryFn: () => api.get('/api/me'),
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile, security, and authentication.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
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
