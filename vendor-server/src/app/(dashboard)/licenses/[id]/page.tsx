'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  Card, Text, Group, Badge, Button, SimpleGrid, Table, Code, CopyButton, ActionIcon,
  ThemeIcon, Divider, Alert
} from '@mantine/core';
import { IconArrowLeft, IconCopy, IconCheck, IconBan, IconShieldCheck, IconAlertTriangle, IconClock, IconArrowUp } from '@tabler/icons-react';
import { DashboardShell } from '../../dashboard-shell';
import { notifications } from '@mantine/notifications';

export default function LicenseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['vendor-license', params.id],
    queryFn: () => fetch(`/api/licenses/${params.id}`).then(r => r.json()),
  });

  const revokeMutation = useMutation({
    mutationFn: (reason: string) =>
      fetch(`/api/licenses/${params.id}/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).then(r => r.json()),
    onSuccess: () => {
      notifications.show({ title: 'License revoked', message: 'Deployment will lock on next heartbeat', color: 'red' });
      queryClient.invalidateQueries({ queryKey: ['vendor-license', params.id] });
    },
  });

  const renewMutation = useMutation({
    mutationFn: (values: any) =>
      fetch(`/api/licenses/${params.id}/renew`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }).then(r => r.json()),
    onSuccess: (data) => {
      notifications.show({ title: 'License renewed', message: 'New license key generated', color: 'green' });
      queryClient.invalidateQueries({ queryKey: ['vendor-license', params.id] });
      queryClient.invalidateQueries({ queryKey: ['vendor-licenses'] });
      if (data.licenseKey) {
        navigator.clipboard.writeText(data.licenseKey);
        notifications.show({ title: 'License key copied', message: 'New key copied to clipboard — send to customer', color: 'blue' });
      }
    },
  });

  if (isLoading || !data?.license) {
    return <DashboardShell><Text c="dimmed">Loading...</Text></DashboardShell>;
  }

  const lic = data.license;
  const isRevoked = lic.status === 'revoked';
  const isExpired = new Date(lic.expiresAt) < new Date();
  const heartbeats = lic.heartbeats || [];

  return (
    <DashboardShell>
      <Group mb="xl">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/licenses')}>Back</Button>
      </Group>

      {/* License Info */}
      <Card withBorder padding="lg" radius="lg" mb="xl" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" mb="md">
          <Group gap="md">
            <ThemeIcon size={48} radius="md" color={isRevoked ? 'red' : isExpired ? 'orange' : 'green'} variant="light">
              <IconShieldCheck size={24} />
            </ThemeIcon>
            <div>
              <Text size="xl" fw={700} c="white">{lic.tenantName}</Text>
              <Group gap="sm">
                <Badge size="sm" color={lic.status === 'active' ? 'green' : lic.status === 'revoked' ? 'red' : 'orange'} variant="light">{lic.status}</Badge>
                <Text size="sm" c="dimmed">{lic.customer?.name}</Text>
              </Group>
            </div>
          </Group>
          {!isRevoked && (
            <Group>
              <Button color="green" variant="light" leftSection={<IconArrowUp size={16} />} onClick={() => {
                const expiry = prompt('New expiry date (YYYY-MM-DD):', new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                if (expiry) renewMutation.mutate({ expiresAt: new Date(expiry).toISOString() });
              }}>Renew</Button>
              <Button color="red" variant="light" leftSection={<IconBan size={16} />} onClick={() => {
                const reason = prompt('Reason for revocation?');
                if (reason) revokeMutation.mutate(reason);
              }}>Revoke</Button>
            </Group>
          )}
        </Group>

        <SimpleGrid cols={2} mb="lg">
          <div><Text size="xs" c="dimmed">Plan</Text><Text size="sm" c="white">{lic.plan}</Text></div>
          <div><Text size="xs" c="dimmed">Seats</Text><Text size="sm" c="white">{lic.seats}</Text></div>
          <div><Text size="xs" c="dimmed">Storage</Text><Text size="sm" c="white">{(Number(lic.storageBytes) / 1024 / 1024 / 1024).toFixed(0)} GB</Text></div>
          <div><Text size="xs" c="dimmed">Grace Period</Text><Text size="sm" c="white">{lic.gracePeriodDays} days</Text></div>
          <div><Text size="xs" c="dimmed">Issued</Text><Text size="sm" c="white">{new Date(lic.issuedAt).toLocaleDateString()}</Text></div>
          <div><Text size="xs" c="dimmed">Expires</Text><Text size="sm" c={isExpired ? 'red' : 'white'}>{new Date(lic.expiresAt).toLocaleDateString()}</Text></div>
          {lic.activatedAt && <div><Text size="xs" c="dimmed">First Activated</Text><Text size="sm" c="white">{new Date(lic.activatedAt).toLocaleDateString()}</Text></div>}
          {lic.hardwareFingerprint && <div><Text size="xs" c="dimmed">Hardware Fingerprint</Text><Text size="xs" c="dimmed" ff="monospace">{lic.hardwareFingerprint}</Text></div>}
        </SimpleGrid>

        {isRevoked && (
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light" mb="md">
            License revoked on {new Date(lic.revokedAt).toLocaleString()}. Reason: {lic.revokedReason}
          </Alert>
        )}

        <Divider label="License Key" labelPosition="center" my="md" />
        <Code block style={{ maxHeight: 120, overflow: 'auto', wordBreak: 'break-all', fontSize: 10 }}>
          {lic.licenseKey}
        </Code>
        <Group mt="sm">
          <CopyButton value={lic.licenseKey} timeout={2000}>
            {({ copied, copy }) => (
              <Button size="sm" variant="light" color={copied ? 'teal' : 'indigo'} onClick={copy} leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}>
                {copied ? 'Copied!' : 'Copy Key'}
              </Button>
            )}
          </CopyButton>
        </Group>
      </Card>

      {/* Heartbeats */}
      <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" mb="md">
          <Text size="md" fw={600} c="white">Heartbeat History ({heartbeats.length})</Text>
          <Badge size="sm" color="indigo" variant="light">{lic._count?.heartbeats || 0} total</Badge>
        </Group>
        <Table.ScrollContainer minWidth={600}>
          <Table>
            <Table.Thead><Table.Tr><Table.Th>Status</Table.Th><Table.Th>Version</Table.Th><Table.Th>Users</Table.Th><Table.Th>Docs</Table.Th><Table.Th>Storage</Table.Th><Table.Th>Integrity</Table.Th><Table.Th>Received</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {heartbeats.length === 0 ? (
                <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center">No heartbeats received (deployment may be air-gapped)</Text></Table.Td></Table.Tr>
              ) : heartbeats.map((hb: any) => (
                <Table.Tr key={hb.id}>
                  <Table.Td><Badge size="xs" color={hb.licenseStatus === 'active' ? 'green' : 'red'} variant="light">{hb.licenseStatus}</Badge></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{hb.version || '—'}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{hb.activeUsers || '—'}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{hb.documentCount || '—'}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{hb.storageUsed ? `${(Number(hb.storageUsed) / 1024 / 1024 / 1024).toFixed(1)} GB` : '—'}</Text></Table.Td>
                  <Table.Td>
                    {hb.clockRollbackDetected || !hb.integrityValid ? (
                      <Badge size="xs" color="red" variant="light">{hb.clockRollbackDetected ? 'Clock' : 'Tamper'}</Badge>
                    ) : (
                      <Badge size="xs" color="green" variant="light">OK</Badge>
                    )}
                  </Table.Td>
                  <Table.Td><Group gap={4}><IconClock size={12} /><Text size="xs" c="dimmed">{new Date(hb.receivedAt).toLocaleString()}</Text></Group></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </DashboardShell>
  );
}
