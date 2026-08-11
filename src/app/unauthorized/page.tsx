'use client';

/**
 * Smart EDMS — Unauthorized page (401 / 403)
 *
 * Shown when a user tries to access a page they don't have permission for,
 * or when their session has expired. Uses client-side redirect from the
 * API error handler (when a 401/403 is received, the client redirects here).
 *
 * Premium glassmorphism design matching the login page aesthetic.
 */

import Link from 'next/link';
import { ShieldX, LogIn, Home } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useI18n } from '@/i18n/use-i18n';

function UnauthorizedContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const code = searchParams.get('code') || '403';
  const message = searchParams.get('message') || t('errors.unauthorized.defaultMessage');

  const isAuth = code === '401' || code === 'session_revoked' || code === 'session_expired';
  const title = isAuth ? t('errors.unauthorized.sessionExpired') : t('errors.unauthorized.accessDenied');
  const icon = isAuth ? <LogIn className="h-10 w-10 text-muted-foreground" /> : <ShieldX className="h-10 w-10 text-red-500" />;

  return (
    <div className="min-h-screen flex items-center justify-center mesh-bg p-4">
      <div className="glass-strong rounded-2xl p-8 sm:p-12 shadow-2xl max-w-lg w-full text-center">
        {/* Icon */}
        <div className="glass-card flex items-center justify-center w-20 h-20 rounded-2xl mx-auto mb-6 shadow-lg">
          {icon}
        </div>

        {/* Error code */}
        <h1 className="text-7xl sm:text-8xl font-bold gradient-text mb-2">
          {isAuth ? '401' : '403'}
        </h1>
        <h2 className="text-xl font-semibold tracking-tight mb-3">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
          {message}
          {isAuth && t('errors.unauthorized.signInAgainSuffix')}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {isAuth ? (
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all text-sm font-medium w-full sm:w-auto"
            >
              <LogIn className="h-4 w-4" />
              {t('auth.signIn')}
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all text-sm font-medium w-full sm:w-auto"
            >
              <Home className="h-4 w-4" />
              {t('common.goToDashboard')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center mesh-bg">
        <div className="glass-strong rounded-2xl p-8 shadow-2xl">
          <div className="spinner-premium mx-auto" />
        </div>
      </div>
    }>
      <UnauthorizedContent />
    </Suspense>
  );
}
