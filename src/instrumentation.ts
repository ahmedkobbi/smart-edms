/**
 * Smart EDMS — Instrumentation hook
 *
 * Called once when the Next.js server starts.
 * Initializes Sentry before any request is handled.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import('@/lib/config/sentry');
    initSentry();
  }
}
