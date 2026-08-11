'use client';

/**
 * Smart EDMS — Global error boundary (catches errors in the root layout
 * itself — the last-resort fallback when even the ThemeProvider /
 * LocaleDirProvider crash)
 *
 * This component renders OUTSIDE the root layout, so it cannot use any
 * CSS variables, Tailwind theme tokens, or providers. It uses inline
 * styles that match the dark glassmorphism aesthetic so the brand is
 * consistent even in a catastrophic failure.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#e2e8f0',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '3rem 2rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '16px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '36px',
            }}
          >
            ⚠️
          </div>

          <h1
            style={{
              fontSize: '4rem',
              fontWeight: 700,
              margin: '0 0 0.5rem',
              background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            500
          </h1>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.75rem' }}>
            Critical error
          </h2>

          <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0 0 1.5rem' }}>
            A critical error occurred that prevented the application from
            loading. Please try refreshing the page. If the problem persists,
            contact your administrator.
          </p>

          {error.digest && (
            <p
              style={{
                fontSize: '0.75rem',
                color: '#64748b',
                fontFamily: 'monospace',
                marginBottom: '1.5rem',
              }}
            >
              Error ID: {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              height: '44px',
              padding: '0 1.5rem',
              borderRadius: '8px',
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
