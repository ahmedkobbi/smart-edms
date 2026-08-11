'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Text, Group, Badge, Table, Select, TextInput, ThemeIcon, SimpleGrid } from '@mantine/core';
import { IconHistory, IconShieldCheck, IconLicense, IconUsers, IconAlertTriangle, IconBan } from '@tabler/icons-react';
import { DashboardShell } from '../dashboard-shell';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<any>({
    queryKey: ['vendor-audit', actionFilter],
    queryFn: () => fetch(`/api/audit${actionFilter ? `?action=${actionFilter}` : ''}`).then(r => r.json()),
  });

  const logs = (data?.items || []).filter((l: any) =>
    !search || l.action?.includes(search) || l.details?.includes(search) || l.resourceId?.includes(search)
  );

  const actionIcons: Record<string, any> = {
    'license.issued': IconLicense,
    'license.revoked': IconBan,
    'license.renewed': IconLicense,
    'customer.created': IconUsers,
    'customer.updated': IconUsers,
    'admin.user_created': IconShieldCheck,
  };

  const actionColors: Record<string, string> = {
    'license.issued': 'green',
    'license.revoked': 'red',
    'license.renewed': 'blue',
    'customer.created': 'indigo',
    'admin.user_created': 'orange',
  };

  return (
    <DashboardShell>
      <Group justify="space-between" mb="xl">
        <div>
          <Text size="xl" fw={700} c="white">Audit Log</Text>
          <Text size="sm" c="dimmed">All administrative actions recorded</Text>
        </div>
      </Group>

      <Group mb="md">
        <Select
          placeholder="Filter by action"
          clearable
          w={250}
          value={actionFilter}
          onChange={(v) => setActionFilter(v)}
          data={[
            { value: 'license', label: 'All License Actions' },
            { value: 'customer', label: 'All Customer Actions' },
            { value: 'admin', label: 'All Admin Actions' },
          ]}
        />
        <TextInput placeholder="Search..." w={250} value={search} onChange={(e) => setSearch(e.target.value)} />
      </Group>

      <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Table.ScrollContainer minWidth={800}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Action</Table.Th>
                <Table.Th>Resource</Table.Th>
                <Table.Th>Details</Table.Th>
                <Table.Th>Timestamp</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center">Loading...</Text></Table.Td></Table.Tr>
              ) : logs.length === 0 ? (
                <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center">No audit entries</Text></Table.Td></Table.Tr>
              ) : (
                logs.map((log: any) => {
                  const Icon = actionIcons[log.action] || IconHistory;
                  const color = actionColors[log.action] || 'gray';
                  return (
                    <Table.Tr key={log.id}>
                      <Table.Td>
                        <Group gap="sm">
                          <ThemeIcon size={28} radius="md" color={color} variant="light"><Icon size={14} /></ThemeIcon>
                          <Text size="sm" c="white">{log.action}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        {log.resourceType && <Badge size="xs" variant="light" color="gray">{log.resourceType}</Badge>}
                        {log.resourceId && <Text size="xs" c="dimmed" ff="monospace">{log.resourceId.substring(0, 12)}...</Text>}
                      </Table.Td>
                      <Table.Td><Text size="xs" c="dimmed" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.details || '—'}</Text></Table.Td>
                      <Table.Td><Text size="xs" c="dimmed">{new Date(log.createdAt).toLocaleString()}</Text></Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </DashboardShell>
  );
}
