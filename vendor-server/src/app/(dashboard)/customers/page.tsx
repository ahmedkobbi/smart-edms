'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, Text, Group, Button, Badge, Table, Modal, TextInput, Textarea,
  SimpleGrid, ThemeIcon, Avatar
} from '@mantine/core';
import { IconUsers, IconPlus, IconMail, IconPhone, IconMapPin } from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { DashboardShell } from '../dashboard-shell';
import { useState } from 'react';

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['vendor-customers'],
    queryFn: () => fetch('/api/customers').then(r => r.json()),
  });

  const customers = data?.items || [];

  return (
    <DashboardShell>
      <Group justify="space-between" mb="xl">
        <div>
          <Text size="xl" fw={700} c="white">Customers</Text>
          <Text size="sm" c="dimmed">Manage organizations that have purchased licenses</Text>
        </div>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setShowCreate(true)}>
          Add Customer
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} mb="xl">
        {[
          { label: 'Total', value: customers.length, color: 'blue' },
          { label: 'Active', value: customers.filter((c: any) => c.status === 'active').length, color: 'green' },
          { label: 'Suspended', value: customers.filter((c: any) => c.status === 'suspended').length, color: 'orange' },
          { label: 'Churned', value: customers.filter((c: any) => c.status === 'churned').length, color: 'red' },
        ].map(stat => (
          <Card key={stat.label} withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <Text size="xl" fw={700} c="white">{stat.value}</Text>
            <Text size="xs" c="dimmed">{stat.label}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Table.ScrollContainer minWidth={700}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Contact</Table.Th>
                <Table.Th>Licenses</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr><Table.Td colSpan={5}><Text c="dimmed" ta="center">Loading...</Text></Table.Td></Table.Tr>
              ) : customers.length === 0 ? (
                <Table.Tr><Table.Td colSpan={5}><Text c="dimmed" ta="center">No customers yet. Click "Add Customer" to create one.</Text></Table.Td></Table.Tr>
              ) : (
                customers.map((c: any) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      <Group gap="sm">
                        <Avatar size={32} color="indigo" variant="light">{c.name[0]}</Avatar>
                        <div>
                          <Text size="sm" c="white">{c.name}</Text>
                          {c.country && <Text size="xs" c="dimmed">{c.country}</Text>}
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">{c.email}</Text>
                      {c.phone && <Text size="xs" c="dimmed">{c.phone}</Text>}
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light" color="indigo">{c._count?.licenses || 0} licenses</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" color={c.status === 'active' ? 'green' : c.status === 'suspended' ? 'orange' : 'red'} variant="light">
                        {c.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{new Date(c.createdAt).toLocaleDateString()}</Text></Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <CreateCustomerModal opened={showCreate} onClose={() => setShowCreate(false)} />
    </DashboardShell>
  );
}

function CreateCustomerModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();

  const form = useForm({
    initialValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      country: '',
      notes: '',
    },
    validate: {
      name: (v) => v.length < 2 && 'Minimum 2 characters',
      email: (v) => !/^\S+@\S+$/.test(v) && 'Invalid email',
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: any) =>
      fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      }).then(r => r.json()),
    onSuccess: () => {
      notifications.show({ title: 'Customer created', message: 'The customer has been added', color: 'green' });
      queryClient.invalidateQueries({ queryKey: ['vendor-customers'] });
      form.reset();
      onClose();
    },
    onError: (err: any) => {
      notifications.show({ title: 'Failed', message: err?.message || 'Customer creation failed', color: 'red' });
    },
  });

  return (
    <Modal opened={opened} onClose={() => { onClose(); form.reset(); }} title="Add New Customer" size="md">
      <form onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
        <TextInput label="Organization Name" placeholder="Acme Corporation" {...form.getInputProps('name')} mb="sm" />
        <TextInput label="Email" placeholder="contact@acme.com" {...form.getInputProps('email')} mb="sm" />
        <TextInput label="Phone" placeholder="Optional" {...form.getInputProps('phone')} mb="sm" />
        <TextInput label="Address" placeholder="Optional" {...form.getInputProps('address')} mb="sm" />
        <TextInput label="Country" placeholder="Optional" {...form.getInputProps('country')} mb="sm" />
        <Textarea label="Notes" placeholder="Optional" autosize minRows={2} {...form.getInputProps('notes')} mb="lg" />
        <Group justify="flex-end">
          <Button variant="light" onClick={() => { onClose(); form.reset(); }}>Cancel</Button>
          <Button type="submit" loading={createMutation.isPending}>Create Customer</Button>
        </Group>
      </form>
    </Modal>
  );
}
