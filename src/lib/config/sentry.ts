/**
 * Smart EDMS — Sentry configuration
 *
 * Sentry provides production error tracking, performance monitoring,
 * and release tracking. Configure via SENTRY_DSN environment variable.
 *
 * If SENTRY_DSN is not set, Sentry is a no-op (no errors sent).
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.npm_package_version || '1.0.0',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Filter out sensitive information
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-step-up-token'];
        delete event.request.headers['x-break-glass-token'];
      }
      // Remove sensitive request body fields
      if (event.request?.data && typeof event.request.data === 'object') {
        const data = event.request.data as Record<string, unknown>;
        delete data.password;
        delete data.passwordHash;
        delete data.token;
        delete data.secret;
        delete data.mfaSecret;
        delete data.clientSecret;
      }
      return event;
    },
    ignoreErrors: [
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
    ],
  });
}

export { Sentry };
