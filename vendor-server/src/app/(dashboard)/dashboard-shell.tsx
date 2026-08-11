'use client';

import { AppShell, NavLink, Text, Badge, Group, Avatar, Button } from '@mantine/core';
import { IconDashboard, IconLicense, IconUsers, IconHeartbeat, IconShieldCheck, IconKey, IconLogout } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <AppShell
      navbar={{
        width: 260,
        breakpoint: 'sm',
      }}
      padding="xl"
      styles={{
        navbar: {
          background: 'linear-gradient(180deg, var(--mantine-color-dark-7) 0%, var(--mantine-color-dark-8) 100%)',
          borderRight: '1px solid var(--mantine-color-dark-5)',
        },
        main: {
          background: 'var(--mantine-color-dark-8)',
        },
      }}
    >
      <AppShell.Navbar p="md">
        <Group mb="xl" gap="sm">
          <Avatar size={40} radius="md" color="indigo" variant="filled">
            <IconShieldCheck size={22} />
          </Avatar>
          <div>
            <Text size="sm" fw={700} c="white">Smart EDMS</Text>
            <Text size="xs" c="dimmed">Vendor Server</Text>
          </div>
        </Group>

        <Text size="xs" c="dimmed" mb="xs" px="sm" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Management
        </Text>

        <NavLink
          component={Link}
          href="/dashboard"
          label="Dashboard"
          leftSection={<IconDashboard size={18} />}
          active={pathname === '/dashboard'}
          variant="light"
        />
        <NavLink
          component={Link}
          href="/licenses"
          label="Licenses"
          leftSection={<IconLicense size={18} />}
          active={pathname.startsWith('/licenses')}
          variant="light"
        />
        <NavLink
          component={Link}
          href="/customers"
          label="Customers"
          leftSection={<IconUsers size={18} />}
          active={pathname.startsWith('/customers')}
          variant="light"
        />

        <Text size="xs" c="dimmed" mb="xs" mt="xl" px="sm" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          System
        </Text>

        <NavLink
          component={Link}
          href="/heartbeat"
          label="Heartbeats"
          leftSection={<IconHeartbeat size={18} />}
          active={pathname === '/heartbeat'}
          variant="light"
        />

        <div style={{ marginTop: 'auto', paddingTop: 'xl' }}>
          <Group gap="xs" p="sm" style={{ borderRadius: 'md', background: 'var(--mantine-color-dark-7)' }} mb="sm">
            <Avatar size={28} color="indigo" variant="light">
              <IconKey size={16} />
            </Avatar>
            <div>
              <Text size="xs" c="white">Ed25519 Active</Text>
              <Badge size="xs" color="green" variant="light">Secure</Badge>
            </div>
          </Group>
          <Button variant="subtle" color="red" fullWidth leftSection={<IconLogout size={16} />} onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </AppShell.Navbar>

      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
