'use client';

/**
 * Smart EDMS — App-level error boundary (catches unhandled errors in
 * any route segment below the root layout)
 *
 * Premium glassmorphism error page shown when a server or client error
 * occurs (500, rendering crash, unhandled exception). The error is
 * reported to Sentry (if configured) by the API handler layer; this
 * component is the user-facing fallback.
 *
 * Uses Next.js App Router `error.tsx` convention — must be a client
 * component with `error` + `reset` props.
 */

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for dev — Sentry reporting is handled by the API
    // handler layer for server-side errors; client-side errors are caught
    // here and can be forwarded to Sentry via the Sentry browser SDK.
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center mesh-bg p-4">
      <div className="glass-strong rounded-2xl p-8 sm:p-12 shadow-2xl max-w-lg w-full text-center">
        {/* Icon */}
        <div className="glass-card flex items-center justify-center w-20 h-20 rounded-2xl mx-auto mb-6 shadow-lg">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
        </div>

        {/* Error code */}
        <h1 className="text-7xl sm:text-8xl font-bold gradient-text mb-2">500</h1>
        <h2 className="text-xl font-semibold tracking-tight mb-3">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
          An unexpected error occurred. Our team has been notified.
          You can try again, or return to the dashboard.
        </p>

        {/* Error digest (for support reference) */}
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono mb-6">
            Error ID: {error.digest}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all text-sm font-medium w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md glass border-0 hover-lift transition-all text-sm font-medium w-full sm:w-auto"
          >
            <Home className="h-4 w-4" />
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
