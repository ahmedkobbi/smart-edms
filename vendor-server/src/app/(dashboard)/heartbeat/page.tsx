'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Text, Group, Badge, Table, SimpleGrid, ThemeIcon } from '@mantine/core';
import { IconHeartbeat, IconClock, IconAlertTriangle } from '@tabler/icons-react';
import { DashboardShell } from '../dashboard-shell';
import { api } from '@/lib/api';

export default function HeartbeatsPage() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['vendor-heartbeats'],
    queryFn: () => fetch('/api/heartbeat?hours=168').then(r => r.json()),
    refetchInterval: 30_000,
  });

  const heartbeats = data?.items || [];
  const activeDeployments = new Set(heartbeats.map((h: any) => h.licenseId)).size;
  const issues = heartbeats.filter((h: any) => h.clockRollbackDetected || !h.integrityValid).length;

  return (
    <DashboardShell>
      <Group justify="space-between" mb="xl">
        <div>
          <Text size="xl" fw={700} c="white">Heartbeats</Text>
          <Text size="sm" c="dimmed">Real-time deployment health monitoring (last 7 days)</Text>
        </div>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} mb="xl">
        {[
          { label: 'Total Signals', value: heartbeats.length, color: 'blue' as const },
          { label: 'Active Deployments', value: activeDeployments, color: 'green' as const },
          { label: 'Issues Detected', value: issues, color: 'red' as const },
          { label: 'Last 24h', value: heartbeats.filter((h: any) => new Date(h.receivedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length, color: 'indigo' as const },
        ].map(stat => (
          <Card key={stat.label} withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <Group gap="sm" mb="xs">
              <ThemeIcon size={32} radius="md" color={stat.color} variant="light">
                <IconHeartbeat size={16} />
              </ThemeIcon>
            </Group>
            <Text size="xl" fw={700} c="white">{stat.value}</Text>
            <Text size="xs" c="dimmed">{stat.label}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" mb="md">
          <Text size="md" fw={600} c="white">All Heartbeats</Text>
          <Badge size="sm" color="indigo" variant="light">{heartbeats.length} signals</Badge>
        </Group>
        <Table.ScrollContainer minWidth={800}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Deployment</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Users</Table.Th>
                <Table.Th>Docs</Table.Th>
                <Table.Th>Integrity</Table.Th>
                <Table.Th>Received</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center">Loading...</Text></Table.Td></Table.Tr>
              ) : heartbeats.length === 0 ? (
                <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center">No heartbeats received. Deployments may be air-gapped or offline.</Text></Table.Td></Table.Tr>
              ) : (
                heartbeats.map((hb: any) => (
                  <Table.Tr key={hb.id}>
                    <Table.Td><Text size="sm" c="white">{hb.customer?.name}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{hb.license?.tenantName}</Text></Table.Td>
                    <Table.Td>
                      <Badge size="xs" color={hb.licenseStatus === 'active' ? 'green' : hb.licenseStatus === 'grace_period' ? 'orange' : 'red'} variant="light">
                        {hb.licenseStatus}
                      </Badge>
                    </Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{hb.activeUsers || '—'}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{hb.documentCount || '—'}</Text></Table.Td>
                    <Table.Td>
                      {hb.clockRollbackDetected || !hb.integrityValid ? (
                        <Badge size="xs" color="red" variant="light" leftSection={<IconAlertTriangle size={10} />}>
                          {hb.clockRollbackDetected ? 'Clock Rollback' : 'Integrity Fail'}
                        </Badge>
                      ) : (
                        <Badge size="xs" color="green" variant="light">OK</Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <IconClock size={12} />
                        <Text size="xs" c="dimmed">{new Date(hb.receivedAt).toLocaleString()}</Text>
                      </Group>
                    </Table.Td>
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
