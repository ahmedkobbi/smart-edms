/**
 * Smart EDMS — Root layout
 */

import type { Metadata } from "next";
import { Inter, Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { LocaleDirProvider } from "@/components/providers/locale-dir-provider";
import { logger } from "@/lib/config/logger";
import { assertEnv } from "@/lib/config/env";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Arabic font for RTL content — elegant typography
const cairo = Cairo({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Smart EDMS — Secure Document Governance",
  description:
    "Smart EDMS is a high-assurance, multi-tenant SaaS Electronic Document Management System with tamper-evident audit, classification, retention, legal hold, and workflow governance.",
  keywords: [
    "EDMS",
    "document management",
    "records management",
    "compliance",
    "audit",
    "governance",
    "Smart EDMS",
  ],
  authors: [{ name: "Smart EDMS" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Smart EDMS",
    description: "Secure document governance for regulated industries",
    siteName: "Smart EDMS",
    type: "website",
  },
  robots: { index: false, follow: false },
};

// Validate environment at startup
if (process.env.NODE_ENV === 'production') {
  try {
    assertEnv();
    logger.info('app.startup', { status: 'environment validated', nodeEnv: process.env.NODE_ENV });
  } catch (err: any) {
    logger.error('app.startup_failed', { error: err.message });
  }
} else {
  logger.info('app.startup', { status: 'development mode', nodeEnv: process.env.NODE_ENV });
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${cairo.variable} font-sans antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <LocaleDirProvider>
            <SessionProvider>
              <QueryProvider>
                {children}
                <Toaster />
                <SonnerToaster position="top-right" richColors />
              </QueryProvider>
            </SessionProvider>
          </LocaleDirProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
