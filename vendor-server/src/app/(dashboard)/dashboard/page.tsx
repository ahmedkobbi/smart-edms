'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Text, Group, Badge, Table, Avatar, ThemeIcon, SimpleGrid, Progress } from '@mantine/core';
import { IconUsers, IconLicense, IconAlertTriangle, IconHeartbeat, IconShieldCheck, IconClock, IconCurrencyDollar, IconTrendingUp } from '@tabler/icons-react';
import { DashboardShell } from '../dashboard-shell';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const { data: dashData, isLoading: dashLoading } = useQuery<any>({
    queryKey: ['vendor-dashboard'],
    queryFn: () => fetch('/api/dashboard').then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<any>({
    queryKey: ['vendor-stats'],
    queryFn: () => fetch('/api/stats').then(r => r.json()),
    refetchInterval: 60_000,
  });

  const stats = dashData?.stats || {};
  const revenue = statsData?.revenue || {};
  const licenseByPlan = statsData?.licenses?.byPlan || [];
  const expiringLicenses = statsData?.licenses?.expiring || [];
  const heartbeatChart = statsData?.heartbeats?.chart || [];
  const revenueChart = revenue.chart || [];
  const maxRevenue = Math.max(...revenueChart.map((r: any) => r.revenue), 1);
  const maxHeartbeats = Math.max(...heartbeatChart.map((h: any) => h.count), 1);

  const recentHeartbeats = dashData?.recentHeartbeats || [];
  const recentLicenses = dashData?.recentLicenses || [];

  const statCards = [
    { label: 'Customers', value: stats.totalCustomers || 0, icon: IconUsers, color: 'blue' as const },
    { label: 'Active Licenses', value: stats.activeLicenses || 0, icon: IconLicense, color: 'green' as const },
    { label: 'Expiring (30d)', value: stats.expiringLicenses || 0, icon: IconClock, color: 'orange' as const },
    { label: 'Heartbeats (24h)', value: stats.heartbeats24h || 0, icon: IconHeartbeat, color: 'indigo' as const },
    { label: 'Total Revenue', value: `$${(revenue.total || 0).toLocaleString()}`, icon: IconCurrencyDollar, color: 'teal' as const },
    { label: 'Monthly Revenue', value: `$${(revenue.monthly || 0).toLocaleString()}`, icon: IconTrendingUp, color: 'grape' as const },
  ];

  return (
    <DashboardShell>
      <div style={{ marginBottom: 24 }}>
        <Text size="xl" fw={700} c="white">Dashboard</Text>
        <Text size="sm" c="dimmed">Overview of licenses, customers, revenue, and deployment health</Text>
      </div>

      {/* Stats Grid */}
      <SimpleGrid cols={{ base: 2, md: 3, lg: 6 }} mb="xl">
        {statCards.map((stat) => (
          <Card key={stat.label} withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <Group justify="space-between" mb="xs">
              <ThemeIcon size={36} radius="md" color={stat.color} variant="light"><stat.icon size={18} /></ThemeIcon>
            </Group>
            <Text size="xl" fw={700} c="white">{stat.value}</Text>
            <Text size="xs" c="dimmed">{stat.label}</Text>
          </Card>
        ))}
      </SimpleGrid>

      {/* Charts Row */}
      <SimpleGrid cols={{ base: 1, md: 2 }} mb="xl">
        {/* Revenue Chart */}
        <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
          <Group justify="space-between" mb="md">
            <Text size="md" fw={600} c="white">Revenue (12 months)</Text>
            <Badge size="sm" color="teal" variant="light">${(revenue.total || 0).toLocaleString()} total</Badge>
          </Group>
          <Group gap="xs" align="flex-end" style={{ height: 120 }}>
            {revenueChart.map((item: any, i: number) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%',
                  height: `${(item.revenue / maxRevenue) * 100}%`,
                  minHeight: item.revenue > 0 ? 8 : 2,
                  background: item.revenue > 0 ? 'linear-gradient(180deg, var(--mantine-color-teal-6) 0%, var(--mantine-color-teal-8) 100%)' : 'var(--mantine-color-dark-5)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease',
                }} />
                <Text size="xs" c="dimmed">{item.month}</Text>
              </div>
            ))}
          </Group>
        </Card>

        {/* Heartbeat Chart */}
        <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
          <Group justify="space-between" mb="md">
            <Text size="md" fw={600} c="white">Heartbeats (7 days)</Text>
            <Badge size="sm" color="indigo" variant="light">{statsData?.heartbeats?.total7d || 0} total</Badge>
          </Group>
          <Group gap="xs" align="flex-end" style={{ height: 120 }}>
            {heartbeatChart.map((item: any, i: number) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%',
                  height: `${(item.count / maxHeartbeats) * 100}%`,
                  minHeight: item.count > 0 ? 8 : 2,
                  background: item.count > 0 ? 'linear-gradient(180deg, var(--mantine-color-indigo-6) 0%, var(--mantine-color-indigo-8) 100%)' : 'var(--mantine-color-dark-5)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease',
                }} />
                <Text size="xs" c="dimmed">{item.day}</Text>
              </div>
            ))}
          </Group>
        </Card>
      </SimpleGrid>

      {/* Expiring Licenses */}
      {expiringLicenses.length > 0 && (
        <Card withBorder padding="lg" radius="lg" mb="xl" style={{ background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
          <Group justify="space-between" mb="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="md" color="orange" variant="light"><IconAlertTriangle size={16} /></ThemeIcon>
              <Text size="md" fw={600} c="white">Expiring Licenses (next 30 days)</Text>
            </Group>
            <Badge size="sm" color="orange" variant="light">{expiringLicenses.length}</Badge>
          </Group>
          <Table.ScrollContainer minWidth={600}>
            <Table>
              <Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Deployment</Table.Th><Table.Th>Expires</Table.Th><Table.Th>Progress</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {expiringLicenses.map((lic: any) => {
                  const daysLeft = Math.ceil((new Date(lic.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                  const pct = (daysLeft / 30) * 100;
                  return (
                    <Table.Tr key={lic.id}>
                      <Table.Td><Text size="sm" c="white">{lic.customer?.name}</Text></Table.Td>
                      <Table.Td><Text size="sm" c="dimmed">{lic.tenantName}</Text></Table.Td>
                      <Table.Td><Text size="xs" c={daysLeft < 7 ? 'red' : 'orange'}>{new Date(lic.expiresAt).toLocaleDateString()} ({daysLeft}d)</Text></Table.Td>
                      <Table.Td style={{ width: 150 }}><Progress size="sm" color={daysLeft < 7 ? 'red' : 'orange'} value={pct} /></Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      {/* Recent Heartbeats + Recent Licenses */}
      <SimpleGrid cols={{ base: 1, md: 2 }} mb="xl">
        <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
          <Group justify="space-between" mb="md">
            <Text size="md" fw={600} c="white">Recent Heartbeats</Text>
            <Badge size="sm" color="indigo" variant="light">{recentHeartbeats.length}</Badge>
          </Group>
          <Table.ScrollContainer minWidth={400}>
            <Table>
              <Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Status</Table.Th><Table.Th>Users</Table.Th><Table.Th>Seen</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {dashLoading ? <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center">Loading...</Text></Table.Td></Table.Tr> :
                recentHeartbeats.length === 0 ? <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center">No heartbeats (24h)</Text></Table.Td></Table.Tr> :
                recentHeartbeats.map((hb: any) => (
                  <Table.Tr key={hb.id}>
                    <Table.Td><Text size="sm" c="white">{hb.customer?.name}</Text></Table.Td>
                    <Table.Td><Badge size="xs" color={hb.licenseStatus === 'active' ? 'green' : 'red'} variant="light">{hb.licenseStatus}</Badge></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{hb.activeUsers || '—'}</Text></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{new Date(hb.receivedAt).toLocaleTimeString()}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>

        <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
          <Group justify="space-between" mb="md">
            <Text size="md" fw={600} c="white">Recent Licenses</Text>
            <Badge size="sm" color="green" variant="light">{recentLicenses.length}</Badge>
          </Group>
          <Table.ScrollContainer minWidth={400}>
            <Table>
              <Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Plan</Table.Th><Table.Th>Status</Table.Th><Table.Th>Expires</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {dashLoading ? <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center">Loading...</Text></Table.Td></Table.Tr> :
                recentLicenses.length === 0 ? <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center">No licenses yet</Text></Table.Td></Table.Tr> :
                recentLicenses.map((lic: any) => (
                  <Table.Tr key={lic.id}>
                    <Table.Td><Text size="sm" c="white">{lic.customer?.name}</Text></Table.Td>
                    <Table.Td><Badge size="xs" variant="light" color="indigo">{lic.plan}</Badge></Table.Td>
                    <Table.Td><Badge size="xs" color={lic.status === 'active' ? 'green' : 'red'} variant="light">{lic.status}</Badge></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{new Date(lic.expiresAt).toLocaleDateString()}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </SimpleGrid>

      {/* License Distribution */}
      {licenseByPlan.length > 0 && (
        <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
          <Text size="md" fw={600} c="white" mb="md">License Distribution by Plan</Text>
          <SimpleGrid cols={{ base: 2, md: 4 }}>
            {licenseByPlan.map((item: any) => (
              <Group key={item.plan} gap="sm">
                <ThemeIcon size={32} radius="md" color="indigo" variant="light"><IconLicense size={16} /></ThemeIcon>
                <div><Text size="lg" fw={700} c="white">{item.count}</Text><Text size="xs" c="dimmed" tt="capitalize">{item.plan}</Text></div>
              </Group>
            ))}
          </SimpleGrid>
        </Card>
      )}
    </DashboardShell>
  );
}
