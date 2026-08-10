import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  async headers() {
    // Content-Security-Policy:
    //   - script-src: 'self' + 'unsafe-inline' is required for Next.js
    //     in development (React refresh + Next.js dev scripts). In
    //     production, Next.js 14+ supports nonce-based CSP via the
    //     `headers()` API — but only when Server Components are used
    //     exclusively. For our mixed RSC/client app, we use 'unsafe-inline'
    //     as the pragmatic baseline and tighten with 'strict-dynamic' +
    //     nonces in a future hardening pass.
    //   - The XSS risk from 'unsafe-inline' scripts is mitigated by:
    //       (1) React's automatic output escaping
    //       (2) Our manual escapeHtml() in email rendering
    //       (3) No user-supplied HTML is ever rendered with
    //           dangerouslySetInnerHTML without sanitization
    //   - style-src: 'unsafe-inline' is required for Tailwind CSS
    //     (which injects styles at runtime via <style> tags).
    //   - connect-src: 'self' + ws://localhost:3003 for dev-mode WebSocket
    //     notifications. In production, the WS URL is same-origin.
    const isDev = process.env.NODE_ENV === 'development';
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";
    const connectSrc = isDev
      ? "connect-src 'self' ws://localhost:3003 http://localhost:3003"
      : "connect-src 'self'";

    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // X-XSS-Protection is deprecated and can introduce vulnerabilities
      // in some browsers. Modern XSS protection is via CSP.
      // { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          scriptSrc,
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data:",
          "img-src 'self' data: blob: https:",
          connectSrc,
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
          "upgrade-insecure-requests",
        ].join('; '),
      },
    ];

    // CORS: validate the allowed origin against a strict allowlist.
    // Default: same-origin only (no cross-origin API access).
    // Set CORS_ALLOW_ORIGIN env var to a comma-separated list of allowed
    // origins (e.g. "https://app.example.com,https://admin.example.com").
    const corsOrigin = process.env.CORS_ALLOW_ORIGIN?.trim()
      ? process.env.CORS_ALLOW_ORIGIN.trim()
      : ''; // empty = same-origin only (no ACAO header sent)

    const apiHeaders: { key: string; value: string }[] = [
      { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, PUT, DELETE, OPTIONS' },
      { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Correlation-Id, X-Step-Up-Token, X-Break-Glass-Token, X-Requested-With, Accept-Language' },
      { key: 'Access-Control-Max-Age', value: '86400' },
    ];
    if (corsOrigin) {
      apiHeaders.unshift({ key: 'Access-Control-Allow-Origin', value: corsOrigin });
      apiHeaders.push({ key: 'Access-Control-Allow-Credentials', value: 'true' });
      apiHeaders.push({ key: 'Vary', value: 'Origin' });
    }

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/api/(.*)',
        headers: apiHeaders,
      },
    ];
  },
};

export default nextConfig;
