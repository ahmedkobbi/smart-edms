import type { Metadata } from 'next';
import { MantineProvider, ColorSchemeScript, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryProvider } from '@/lib/query-provider';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import './globals.css';

const theme = createTheme({
  primaryColor: 'indigo',
  primaryShade: { light: 5, dark: 8 },
  fontFamily: 'Inter, system-ui, sans-serif',
  headings: { fontFamily: 'Inter, system-ui, sans-serif' },
  defaultRadius: 'md',
  components: {
    Card: {
      defaultProps: {
        shadow: 'sm',
        radius: 'lg',
        p: 'lg',
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});

export const metadata: Metadata = {
  title: 'Smart EDMS — Vendor Server',
  description: 'License management and administration for Smart EDMS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body style={{ background: 'var(--mantine-color-dark-8)', minHeight: '100vh' }}>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <QueryProvider>
            <Notifications position="top-right" />
            {children}
          </QueryProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
