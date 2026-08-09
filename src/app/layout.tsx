/**
 * Smart EDMS — Root layout
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { SessionProvider } from "@/components/providers/session-provider";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <SessionProvider>
            <QueryProvider>
              {children}
              <Toaster />
              <SonnerToaster position="top-right" richColors />
            </QueryProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
