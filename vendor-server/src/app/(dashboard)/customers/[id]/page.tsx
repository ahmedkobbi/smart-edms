'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  Card, Text, Group, Badge, Button, SimpleGrid, Table, Avatar, ThemeIcon,
  TextInput, Textarea, Select, Divider, CopyButton, ActionIcon, Code
} from '@mantine/core';
import { IconArrowLeft, IconMail, IconPhone, IconMapPin, IconLicense, IconHeartbeat, IconCopy, IconCheck, IconEdit } from '@tabler/icons-react';
import { DashboardShell } from '../../dashboard-shell';
import { useState } from 'react';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['vendor-customer', params.id],
    queryFn: () => fetch(`/api/customers/${params.id}`).then(r => r.json()),
  });

  const customer = data?.customer;

  const updateMutation = useMutation({
    mutationFn: (values: any) =>
      fetch(`/api/customers/${params.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-customer', params.id] });
      setEditing(false);
    },
  });

  if (isLoading || !customer) {
    return <DashboardShell><Text c="dimmed">Loading...</Text></DashboardShell>;
  }

  return (
    <DashboardShell>
      <Group mb="xl">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/customers')}>Back</Button>
      </Group>

      {/* Customer Info */}
      <Card withBorder padding="lg" radius="lg" mb="xl" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" mb="md">
          <Group gap="md">
            <Avatar size={48} color="indigo" variant="light">{customer.name[0]}</Avatar>
            <div>
              <Text size="xl" fw={700} c="white">{customer.name}</Text>
              <Group gap="sm">
                <Badge size="sm" color={customer.status === 'active' ? 'green' : customer.status === 'suspended' ? 'orange' : 'red'} variant="light">{customer.status}</Badge>
                <Group gap={4}><IconMail size={14} /><Text size="sm" c="dimmed">{customer.email}</Text></Group>
                {customer.phone && <Group gap={4}><IconPhone size={14} /><Text size="sm" c="dimmed">{customer.phone}</Text></Group>}
              </Group>
            </div>
          </Group>
          <Button variant="light" leftSection={<IconEdit size={16} />} onClick={() => setEditing(!editing)}>Edit</Button>
        </Group>

        {editing ? (
          <CustomerEditForm customer={customer} onSave={(v) => updateMutation.mutate(v)} onCancel={() => setEditing(false)} loading={updateMutation.isPending} />
        ) : (
          <SimpleGrid cols={3} mb="md">
            <div><Text size="xs" c="dimmed">Country</Text><Text size="sm" c="white">{customer.country || '—'}</Text></div>
            <div><Text size="xs" c="dimmed">Address</Text><Text size="sm" c="white">{customer.address || '—'}</Text></div>
            <div><Text size="xs" c="dimmed">Created</Text><Text size="sm" c="white">{new Date(customer.createdAt).toLocaleDateString()}</Text></div>
          </SimpleGrid>
        )}

        {customer.notes && <><Divider my="sm" /><Text size="sm" c="dimmed">{customer.notes}</Text></>}
      </Card>

      {/* Stats */}
      <SimpleGrid cols={3} mb="xl">
        <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
          <Group gap="sm"><ThemeIcon size={32} color="indigo" variant="light"><IconLicense size={16} /></ThemeIcon><div><Text size="xl" fw={700} c="white">{customer._count?.licenses || 0}</Text><Text size="xs" c="dimmed">Licenses</Text></div></Group>
        </Card>
        <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
          <Group gap="sm"><ThemeIcon size={32} color="blue" variant="light"><IconHeartbeat size={16} /></ThemeIcon><div><Text size="xl" fw={700} c="white">{customer._count?.heartbeats || 0}</Text><Text size="xs" c="dimmed">Heartbeats</Text></div></Group>
        </Card>
        <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
          <Group gap="sm"><ThemeIcon size={32} color="green" variant="light"><IconMail size={16} /></ThemeIcon><div><Text size="xl" fw={700} c="white">{customer._count?.payments || 0}</Text><Text size="xs" c="dimmed">Payments</Text></div></Group>
        </Card>
      </SimpleGrid>

      {/* Licenses */}
      <Card withBorder padding="lg" radius="lg" mb="xl" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Text size="md" fw={600} c="white" mb="md">Licenses ({customer.licenses?.length || 0})</Text>
        <Table.ScrollContainer minWidth={600}>
          <Table>
            <Table.Thead><Table.Tr><Table.Th>Deployment</Table.Th><Table.Th>Plan</Table.Th><Table.Th>Seats</Table.Th><Table.Th>Status</Table.Th><Table.Th>Expires</Table.Th><Table.Th>Key</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {(customer.licenses || []).map((lic: any) => (
                <Table.Tr key={lic.id}>
                  <Table.Td><Text size="sm" c="white">{lic.tenantName}</Text></Table.Td>
                  <Table.Td><Badge size="xs" variant="light" color="indigo">{lic.plan}</Badge></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{lic.seats}</Text></Table.Td>
                  <Table.Td><Badge size="xs" color={lic.status === 'active' ? 'green' : lic.status === 'revoked' ? 'red' : 'orange'} variant="light">{lic.status}</Badge></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{new Date(lic.expiresAt).toLocaleDateString()}</Text></Table.Td>
                  <Table.Td>
                    <CopyButton value={lic.licenseKey} timeout={2000}>
                      {({ copied, copy }) => <ActionIcon variant="subtle" onClick={copy}>{copied ? <IconCheck size={14} color="teal" /> : <IconCopy size={14} />}</ActionIcon>}
                    </CopyButton>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {/* Recent Heartbeats */}
      <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Text size="md" fw={600} c="white" mb="md">Recent Heartbeats</Text>
        <Table.ScrollContainer minWidth={500}>
          <Table>
            <Table.Thead><Table.Tr><Table.Th>Deployment</Table.Th><Table.Th>Status</Table.Th><Table.Th>Users</Table.Th><Table.Th>Integrity</Table.Th><Table.Th>Received</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {(customer.heartbeats || []).slice(0, 20).map((hb: any) => (
                <Table.Tr key={hb.id}>
                  <Table.Td><Text size="sm" c="dimmed">{hb.license?.tenantName || '—'}</Text></Table.Td>
                  <Table.Td><Badge size="xs" color={hb.licenseStatus === 'active' ? 'green' : 'red'} variant="light">{hb.licenseStatus}</Badge></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{hb.activeUsers || '—'}</Text></Table.Td>
                  <Table.Td><Badge size="xs" color={hb.integrityValid ? 'green' : 'red'} variant="light">{hb.integrityValid ? 'OK' : 'FAIL'}</Badge></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{new Date(hb.receivedAt).toLocaleString()}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </DashboardShell>
  );
}

function CustomerEditForm({ customer, onSave, onCancel, loading }: { customer: any; onSave: (v: any) => void; onCancel: () => void; loading: boolean }) {
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email);
  const [phone, setPhone] = useState(customer.phone || '');
  const [address, setAddress] = useState(customer.address || '');
  const [country, setCountry] = useState(customer.country || '');
  const [notes, setNotes] = useState(customer.notes || '');
  const [status, setStatus] = useState(customer.status);

  return (
    <div>
      <SimpleGrid cols={2}>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextInput label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
      </SimpleGrid>
      <TextInput label="Address" value={address} onChange={(e) => setAddress(e.target.value)} mt="sm" />
      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} mt="sm" autosize minRows={2} />
      <Select label="Status" value={status} onChange={(v) => v && setStatus(v)} data={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'churned', label: 'Churned' }]} mt="sm" />
      <Group justify="flex-end" mt="md">
        <Button variant="light" onClick={onCancel}>Cancel</Button>
        <Button loading={loading} onClick={() => onSave({ name, email, phone, address, country, notes, status })}>Save</Button>
      </Group>
    </div>
  );
}
