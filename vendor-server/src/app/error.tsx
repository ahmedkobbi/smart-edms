'use client';

import { Card, Text, Button, Group, ThemeIcon, Container } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Container size={500} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card withBorder padding="xl" radius="lg" style={{ width: '100%', background: 'rgba(20, 20, 28, 0.8)', backdropFilter: 'blur(16px)' }}>
        <Group justify="center" mb="md">
          <ThemeIcon size={56} radius="xl" color="red" variant="light">
            <IconAlertTriangle size={28} />
          </ThemeIcon>
        </Group>
        <Text size="lg" fw={700} ta="center" c="white" mb="xs">Something went wrong</Text>
        <Text size="sm" ta="center" c="dimmed" mb="xl">{error.message || 'An unexpected error occurred'}</Text>
        <Group justify="center">
          <Button onClick={reset}>Try again</Button>
        </Group>
      </Card>
    </Container>
  );
}
