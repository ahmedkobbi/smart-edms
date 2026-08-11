'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Text, Group, SimpleGrid, Badge, Table, Avatar, Progress, ThemeIcon } from '@mantine/core';
import { IconUsers, IconLicense, IconAlertTriangle, IconHeartbeat, IconShieldCheck, IconClock } from '@tabler/icons-react';
import { DashboardShell } from '../dashboard-shell';

export default function DashboardPage() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['vendor-dashboard'],
    queryFn: () => fetch('/api/dashboard').then(r => r.json()),
    refetchInterval: 30_000,
  });

  const stats = data?.stats || {};

  const statCards = [
    { label: 'Total Customers', value: stats.totalCustomers || 0, icon: IconUsers, color: 'blue' },
    { label: 'Active Licenses', value: stats.activeLicenses || 0, icon: IconLicense, color: 'green' },
    { label: 'Expiring (30d)', value: stats.expiringLicenses || 0, icon: IconClock, color: 'orange' },
    { label: 'Heartbeats (24h)', value: stats.heartbeats24h || 0, icon: IconHeartbeat, color: 'indigo' },
    { label: 'Expired', value: stats.expiredLicenses || 0, icon: IconAlertTriangle, color: 'red' },
    { label: 'Revoked', value: stats.revokedLicenses || 0, icon: IconAlertTriangle, color: 'gray' },
  ];

  const recentHeartbeats = data?.recentHeartbeats || [];
  const recentLicenses = data?.recentLicenses || [];

  return (
    <DashboardShell>
      <div style={{ marginBottom: 24 }}>
        <Text size="xl" fw={700} c="white">Dashboard</Text>
        <Text size="sm" c="dimmed">Overview of all licenses, customers, and deployment health</Text>
      </div>

      {/* Stats Grid */}
      <SimpleGrid cols={{ base: 2, md: 3, lg: 6 }} mb="xl">
        {statCards.map((stat) => (
          <Card key={stat.label} withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <Group justify="space-between" mb="xs">
              <ThemeIcon size={36} radius="md" color={stat.color} variant="light">
                <stat.icon size={18} />
              </ThemeIcon>
            </Group>
            <Text size="xl" fw={700} c="white">{stat.value}</Text>
            <Text size="xs" c="dimmed">{stat.label}</Text>
          </Card>
        ))}
      </SimpleGrid>

      {/* Recent Heartbeats */}
      <Card withBorder padding="lg" radius="lg" mb="xl" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" mb="md">
          <Text size="md" fw={600} c="white">Recent Heartbeats (24h)</Text>
          <Badge size="sm" color="indigo" variant="light">{recentHeartbeats.length} deployments</Badge>
        </Group>
        <Table.ScrollContainer minWidth={500}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Deployment</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Users</Table.Th>
                <Table.Th>Docs</Table.Th>
                <Table.Th>Last Seen</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center">Loading...</Text></Table.Td></Table.Tr>
              ) : recentHeartbeats.length === 0 ? (
                <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center">No heartbeats in the last 24 hours</Text></Table.Td></Table.Tr>
              ) : (
                recentHeartbeats.map((hb: any) => (
                  <Table.Tr key={hb.id}>
                    <Table.Td>
                      <Group gap="sm">
                        <Avatar size={28} color="indigo" variant="light">{hb.customer?.name?.[0]}</Avatar>
                        <Text size="sm" c="white">{hb.customer?.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{hb.license?.tenantName}</Text></Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        color={hb.licenseStatus === 'active' ? 'green' : hb.licenseStatus === 'grace_period' ? 'orange' : 'red'}
                        variant="light"
                      >
                        {hb.licenseStatus}
                      </Badge>
                    </Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{hb.activeUsers || '—'}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{hb.documentCount || '—'}</Text></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{new Date(hb.receivedAt).toLocaleString()}</Text></Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {/* Recent Licenses */}
      <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" mb="md">
          <Text size="md" fw={600} c="white">Recently Issued Licenses</Text>
          <Badge size="sm" color="green" variant="light">{recentLicenses.length} recent</Badge>
        </Group>
        <Table.ScrollContainer minWidth={500}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Deployment</Table.Th>
                <Table.Th>Plan</Table.Th>
                <Table.Th>Seats</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Expires</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center">Loading...</Text></Table.Td></Table.Tr>
              ) : recentLicenses.length === 0 ? (
                <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center">No licenses issued yet</Text></Table.Td></Table.Tr>
              ) : (
                recentLicenses.map((lic: any) => (
                  <Table.Tr key={lic.id}>
                    <Table.Td><Text size="sm" c="white">{lic.customer?.name}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{lic.tenantName}</Text></Table.Td>
                    <Table.Td><Badge size="xs" variant="light" color="indigo">{lic.plan}</Badge></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{lic.seats}</Text></Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        color={lic.status === 'active' ? 'green' : lic.status === 'revoked' ? 'red' : 'gray'}
                        variant="light"
                      >
                        {lic.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{new Date(lic.expiresAt).toLocaleDateString()}</Text></Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </DashboardShell>
  );
}
