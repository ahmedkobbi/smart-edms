import { Container, Loader, Text } from '@mantine/core';

export default function Loading() {
  return (
    <Container style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Loader size="lg" color="indigo" />
      <Text size="sm" c="dimmed">Loading...</Text>
    </Container>
  );
}
