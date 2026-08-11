'use client';

import { Card, TextInput, PasswordInput, Button, Text, Group, ThemeIcon, Container } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => !/^\S+@\S+$/.test(v) && 'Invalid email',
      password: (v) => v.length < 8 && 'Minimum 8 characters',
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        notifications.show({ title: 'Login failed', message: data.error?.message || 'Invalid credentials', color: 'red' });
        return;
      }
      notifications.show({ title: 'Welcome', message: `Logged in as ${data.user.name}`, color: 'green' });
      router.push('/dashboard');
      router.refresh();
    } catch {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size={400} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card withBorder padding="xl" radius="lg" style={{ width: '100%', background: 'rgba(20, 20, 28, 0.8)', backdropFilter: 'blur(16px)' }}>
        <Group justify="center" mb="xl">
          <ThemeIcon size={56} radius="xl" color="indigo" variant="light">
            <IconShieldCheck size={28} />
          </ThemeIcon>
        </Group>
        <Text size="xl" fw={700} ta="center" c="white" mb="xs">Smart EDMS</Text>
        <Text size="sm" ta="center" c="dimmed" mb="xl">Vendor Administration Server</Text>

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput
            label="Email"
            placeholder="admin@smartedms.local"
            size="md"
            mb="md"
            {...form.getInputProps('email')}
          />
          <PasswordInput
            label="Password"
            placeholder="Your password"
            size="md"
            mb="xl"
            {...form.getInputProps('password')}
          />
          <Button type="submit" fullWidth size="md" loading={loading}>
            Sign In
          </Button>
        </form>
      </Card>
    </Container>
  );
}
