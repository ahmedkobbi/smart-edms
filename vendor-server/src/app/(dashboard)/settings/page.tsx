'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Text, Group, Button, Badge, Table, Modal, TextInput, Select, PasswordInput, ThemeIcon, SimpleGrid, Divider } from '@mantine/core';
import { IconSettings, IconUsers, IconShieldCheck, IconPlus, IconKey, IconTrash } from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { DashboardShell } from '../dashboard-shell';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['vendor-admin-users'],
    queryFn: () => fetch('/api/admin/users').then(r => r.json()),
  });

  const users = data?.items || [];

  return (
    <DashboardShell>
      <Group justify="space-between" mb="xl">
        <div>
          <Text size="xl" fw={700} c="white">Settings</Text>
          <Text size="sm" c="dimmed">Manage vendor server configuration and admin users</Text>
        </div>
      </Group>

      {/* Admin Users */}
      <Card withBorder padding="lg" radius="lg" mb="xl" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <ThemeIcon size={36} radius="md" color="indigo" variant="light"><IconUsers size={18} /></ThemeIcon>
            <div>
              <Text size="md" fw={600} c="white">Admin Users</Text>
              <Text size="xs" c="dimmed">Users who can access this vendor server</Text>
            </div>
          </Group>
          <Button size="sm" leftSection={<IconPlus size={16} />} onClick={() => setShowCreateAdmin(true)}>Add Admin</Button>
        </Group>
        <Table.ScrollContainer minWidth={500}>
          <Table>
            <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Email</Table.Th><Table.Th>Role</Table.Th><Table.Th>Created</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center">Loading...</Text></Table.Td></Table.Tr>
              ) : users.length === 0 ? (
                <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center">No admin users. Run the seed script to create one.</Text></Table.Td></Table.Tr>
              ) : users.map((u: any) => (
                <Table.Tr key={u.id}>
                  <Table.Td><Group gap="sm"><ThemeIcon size={28} radius="md" color="indigo" variant="light"><IconShieldCheck size={14} /></ThemeIcon><Text size="sm" c="white">{u.name}</Text></Group></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{u.email}</Text></Table.Td>
                  <Table.Td><Badge size="xs" color={u.role === 'superadmin' ? 'red' : 'indigo'} variant="light">{u.role}</Badge></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{new Date(u.createdAt).toLocaleDateString()}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {/* System Info */}
      <Card withBorder padding="lg" radius="lg" mb="xl" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Group gap="sm" mb="md">
          <ThemeIcon size={36} radius="md" color="blue" variant="light"><IconSettings size={18} /></ThemeIcon>
          <div><Text size="md" fw={600} c="white">System Information</Text><Text size="xs" c="dimmed">Vendor server configuration</Text></div>
        </Group>
        <SimpleGrid cols={2}>
          <div><Text size="xs" c="dimmed">Version</Text><Text size="sm" c="white">2.0.0</Text></div>
          <div><Text size="xs" c="dimmed">License Signing</Text><Badge size="sm" color="green" variant="light">Ed25519</Badge></div>
          <div><Text size="xs" c="dimmed">Database</Text><Text size="sm" c="white">SQLite</Text></div>
          <div><Text size="xs" c="dimmed">Heartbeat Endpoint</Text><Badge size="sm" color="green" variant="light">Active</Badge></div>
        </SimpleGrid>
      </Card>

      {/* Key Management */}
      <Card withBorder padding="lg" radius="lg" style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Group gap="sm" mb="md">
          <ThemeIcon size={36} radius="md" color="green" variant="light"><IconKey size={18} /></ThemeIcon>
          <div><Text size="md" fw={600} c="white">Ed25519 Key Status</Text><Text size="xs" c="dimmed">Asymmetric signing keys for license generation</Text></div>
        </Group>
        <SimpleGrid cols={3}>
          <div><Text size="xs" c="dimmed">Private Key</Text><Badge size="sm" color="green" variant="light">Configured</Badge></div>
          <div><Text size="xs" c="dimmed">Public Key</Text><Badge size="sm" color="green" variant="light">Configured</Badge></div>
          <div><Text size="xs" c="dimmed">Key Algorithm</Text><Text size="sm" c="white">Ed25519</Text></div>
        </SimpleGrid>
        <Divider my="sm" />
        <Text size="xs" c="dimmed">The private key is used ONLY on this server to sign licenses. The public key is embedded in the on-prem desktop app for verification. Even if the customer compromises their server, they cannot forge licenses.</Text>
      </Card>

      <CreateAdminModal opened={showCreateAdmin} onClose={() => setShowCreateAdmin(false)} />
    </DashboardShell>
  );
}

function CreateAdminModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();

  const form = useForm({
    initialValues: { email: '', name: '', password: '', role: 'admin' },
    validate: {
      email: (v) => !/^\S+@\S+$/.test(v) && 'Invalid email',
      name: (v) => v.length < 2 && 'Minimum 2 characters',
      password: (v) => v.length < 8 && 'Minimum 8 characters',
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: any) => api('/api/admin/users', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      notifications.show({ title: 'Admin user created', message: 'The admin can now log in', color: 'green' });
      queryClient.invalidateQueries({ queryKey: ['vendor-admin-users'] });
      form.reset();
      onClose();
    },
    onError: (err: any) => notifications.show({ title: 'Failed', message: err?.message, color: 'red' }),
  });

  return (
    <Modal opened={opened} onClose={() => { onClose(); form.reset(); }} title="Add Admin User" size="md">
      <form onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
        <TextInput label="Name" placeholder="John Doe" {...form.getInputProps('name')} mb="sm" />
        <TextInput label="Email" placeholder="admin@smartedms.local" {...form.getInputProps('email')} mb="sm" />
        <PasswordInput label="Password" placeholder="Min 8 characters" {...form.getInputProps('password')} mb="sm" />
        <Select label="Role" data={[{ value: 'admin', label: 'Admin' }, { value: 'superadmin', label: 'Super Admin' }]} {...form.getInputProps('role')} mb="lg" />
        <Group justify="flex-end">
          <Button variant="light" onClick={() => { onClose(); form.reset(); }}>Cancel</Button>
          <Button type="submit" loading={createMutation.isPending}>Create</Button>
        </Group>
      </form>
    </Modal>
  );
}
