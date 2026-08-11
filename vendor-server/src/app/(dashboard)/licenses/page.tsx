'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, Text, Group, Button, Badge, Table, Modal, TextInput, Textarea,
  Select, NumberInput, CopyButton, ActionIcon, Tooltip,
  ThemeIcon, SimpleGrid, Menu, Code
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconLicense, IconPlus, IconCopy, IconCheck, IconDots, IconBan, IconEye } from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { DashboardShell } from '../dashboard-shell';
import { useState } from 'react';
import Link from 'next/link';

export default function LicensesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [viewLicense, setViewLicense] = useState<any>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['vendor-licenses'],
    queryFn: () => fetch('/api/licenses').then(r => r.json()),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      fetch(`/api/licenses/${id}/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).then(r => r.json()),
    onSuccess: () => {
      notifications.show({ title: 'License revoked', message: 'The deployment will lock on next heartbeat', color: 'red' });
      queryClient.invalidateQueries({ queryKey: ['vendor-licenses'] });
    },
  });

  const licenses = data?.items || [];

  return (
    <DashboardShell>
      <Group justify="space-between" mb="xl">
        <div>
          <Text size="xl" fw={700} c="white">Licenses</Text>
          <Text size="sm" c="dimmed">Issue, view, and revoke on-premise licenses</Text>
        </div>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setShowCreate(true)}>
          Issue License
        </Button>
      </Group>

      {/* Stats */}
      <SimpleGrid cols={{ base: 2, md: 4 }} mb="xl">
        {[
          { label: 'Total', value: licenses.length, color: 'blue' },
          { label: 'Active', value: licenses.filter((l: any) => l.status === 'active').length, color: 'green' },
          { label: 'Expired', value: licenses.filter((l: any) => l.status === 'expired').length, color: 'orange' },
          { label: 'Revoked', value: licenses.filter((l: any) => l.status === 'revoked').length, color: 'red' },
        ].map(stat => (
          <Card key={stat.label} withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <Text size="xl" fw={700} c="white">{stat.value}</Text>
            <Text size="xs" c="dimmed">{stat.label}</Text>
          </Card>
        ))}
      </SimpleGrid>

      {/* Table */}
      <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Table.ScrollContainer minWidth={800}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Deployment</Table.Th>
                <Table.Th>Plan</Table.Th>
                <Table.Th>Seats</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Expires</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center">Loading...</Text></Table.Td></Table.Tr>
              ) : licenses.length === 0 ? (
                <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center">No licenses issued yet. Click "Issue License" to create one.</Text></Table.Td></Table.Tr>
              ) : (
                licenses.map((lic: any) => (
                  <Table.Tr key={lic.id} onClick={() => window.location.href = '/licenses/' + lic.id} style={{ cursor: 'pointer' }}>
                    <Table.Td><Text size="sm" c="white">{lic.customer?.name}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{lic.tenantName}</Text></Table.Td>
                    <Table.Td><Badge size="xs" variant="light" color="indigo">{lic.plan}</Badge></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{lic.seats}</Text></Table.Td>
                    <Table.Td>
                      <Badge size="xs" color={lic.status === 'active' ? 'green' : lic.status === 'revoked' ? 'red' : 'orange'} variant="light">
                        {lic.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{new Date(lic.expiresAt).toLocaleDateString()}</Text></Table.Td>
                    <Table.Td>
                      <Menu shadow="md" width={200}>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray"><IconDots size={16} /></ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconEye size={14} />} onClick={() => setViewLicense(lic)}>
                            View Details
                          </Menu.Item>
                          {lic.status === 'active' && (
                            <Menu.Item
                              leftSection={<IconBan size={14} />}
                              color="red"
                              onClick={() => {
                                const reason = prompt('Reason for revocation?');
                                if (reason) revokeMutation.mutate({ id: lic.id, reason });
                              }}
                            >
                              Revoke License
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {/* Create License Modal */}
      <CreateLicenseModal opened={showCreate} onClose={() => setShowCreate(false)} />

      {/* View License Modal */}
      <Modal opened={!!viewLicense} onClose={() => setViewLicense(null)} title="License Details" size="lg">
        {viewLicense && (
          <div>
            <SimpleGrid cols={2} mb="md">
              <div><Text size="xs" c="dimmed">Customer</Text><Text size="sm" c="white">{viewLicense.customer?.name}</Text></div>
              <div><Text size="xs" c="dimmed">Deployment</Text><Text size="sm" c="white">{viewLicense.tenantName}</Text></div>
              <div><Text size="xs" c="dimmed">Plan</Text><Text size="sm" c="white">{viewLicense.plan}</Text></div>
              <div><Text size="xs" c="dimmed">Seats</Text><Text size="sm" c="white">{viewLicense.seats}</Text></div>
              <div><Text size="xs" c="dimmed">Issued</Text><Text size="sm" c="white">{new Date(viewLicense.issuedAt).toLocaleDateString()}</Text></div>
              <div><Text size="xs" c="dimmed">Expires</Text><Text size="sm" c="white">{new Date(viewLicense.expiresAt).toLocaleDateString()}</Text></div>
            </SimpleGrid>
            <Text size="xs" c="dimmed" mb={4}>License Key (send to customer):</Text>
            <Code block style={{ maxHeight: 200, overflow: 'auto', wordBreak: 'break-all', fontSize: 10 }}>
              {viewLicense.licenseKey}
            </Code>
            <Group mt="md">
              <CopyButton value={viewLicense.licenseKey} timeout={2000}>
                {({ copied, copy }) => (
                  <Button color={copied ? 'teal' : 'indigo'} onClick={copy} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}>
                    {copied ? 'Copied!' : 'Copy License Key'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </div>
        )}
      </Modal>
    </DashboardShell>
  );
}

function CreateLicenseModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const { data: customersData } = useQuery<any>({
    queryKey: ['vendor-customers'],
    queryFn: () => fetch('/api/customers').then(r => r.json()),
    enabled: opened,
  });

  const form = useForm({
    initialValues: {
      customerId: '',
      tenantId: '',
      tenantName: '',
      plan: 'enterprise',
      seats: 25,
      storageGb: 5,
      features: ['records_management', 'signatures', 'bpmn_designer', 'security_audit'],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      gracePeriodDays: 30,
    },
    validate: {
      customerId: (v) => !v && 'Select a customer',
      tenantId: (v) => v.length < 3 && 'Minimum 3 characters',
      tenantName: (v) => v.length < 3 && 'Minimum 3 characters',
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: any) =>
      fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, expiresAt: values.expiresAt.toISOString() }),
      }).then(r => r.json()),
    onSuccess: (data) => {
      notifications.show({ title: 'License issued', message: 'The license key has been generated', color: 'green' });
      setGeneratedKey(data.licenseKey);
      queryClient.invalidateQueries({ queryKey: ['vendor-licenses'] });
    },
    onError: (err: any) => {
      notifications.show({ title: 'Failed', message: err?.message || 'License creation failed', color: 'red' });
    },
  });

  return (
    <Modal opened={opened} onClose={() => { onClose(); setGeneratedKey(null); form.reset(); }} title="Issue New License" size="lg">
      {generatedKey ? (
        <div>
          <Text size="sm" mb="md" c="green">✅ License issued successfully!</Text>
          <Text size="xs" c="dimmed" mb={4}>License Key (send to the customer):</Text>
          <Code block style={{ maxHeight: 300, overflow: 'auto', wordBreak: 'break-all', fontSize: 10 }}>
            {generatedKey}
          </Code>
          <Group mt="md">
            <CopyButton value={generatedKey} timeout={2000}>
              {({ copied, copy }) => (
                <Button color={copied ? 'teal' : 'indigo'} onClick={copy} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}>
                  {copied ? 'Copied!' : 'Copy Key'}
                </Button>
              )}
            </CopyButton>
            <Button variant="light" onClick={() => { onClose(); setGeneratedKey(null); form.reset(); }}>Done</Button>
          </Group>
        </div>
      ) : (
        <form onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Select
            label="Customer"
            placeholder="Select customer..."
            data={(customersData?.items || []).map((c: any) => ({ value: c.id, label: `${c.name} (${c.email})` }))}
            {...form.getInputProps('customerId')}
            mb="sm"
          />
          <TextInput label="Tenant ID" placeholder="e.g., cuid-tenant-001" {...form.getInputProps('tenantId')} mb="sm" />
          <TextInput label="Tenant Name" placeholder="e.g., Acme Corporation" {...form.getInputProps('tenantName')} mb="sm" />
          <Group grow mb="sm">
            <Select label="Plan" data={[{ value: 'enterprise', label: 'Enterprise' }]} {...form.getInputProps('plan')} />
            <NumberInput label="Seats" min={1} {...form.getInputProps('seats')} />
          </Group>
          <Group grow mb="sm">
            <NumberInput label="Storage (GB)" min={1} {...form.getInputProps('storageGb')} />
            <NumberInput label="Grace Period (days)" min={0} max={365} {...form.getInputProps('gracePeriodDays')} />
          </Group>
          <DatePickerInput
            label="Expires At"
            placeholder="Select expiry date"
            minDate={new Date()}
            {...form.getInputProps('expiresAt')}
            mb="lg"
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => { onClose(); form.reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Issue License</Button>
          </Group>
        </form>
      )}
    </Modal>
  );
}
