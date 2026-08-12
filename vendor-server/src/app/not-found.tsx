'use client';

import { Card, Text, ThemeIcon, Container, Group } from '@mantine/core';
import { IconFileSearch } from '@tabler/icons-react';

export default function NotFound() {
  return (
    <Container size={500} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card withBorder padding="xl" radius="lg" style={{ width: '100%', background: 'rgba(20, 20, 28, 0.8)', backdropFilter: 'blur(16px)', textAlign: 'center' }}>
        <Group justify="center" mb="md">
          <ThemeIcon size={56} radius="xl" color="indigo" variant="light">
            <IconFileSearch size={28} />
          </ThemeIcon>
        </Group>
        <Text size="xl" fw={700} c="white">404</Text>
        <Text size="sm" c="dimmed" mt="xs">Page not found</Text>
      </Card>
    </Container>
  );
}
