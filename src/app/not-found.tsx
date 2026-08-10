/**
 * Smart EDMS — 404 Not Found page
 *
 * Premium glassmorphism error page shown when a route doesn't exist.
 * Uses the same mesh-bg + glass-strong + gradient-text system as the
 * login page for brand consistency.
 */

import Link from 'next/link';
import { Home, Search, FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center mesh-bg p-4">
      <div className="glass-strong rounded-2xl p-8 sm:p-12 shadow-2xl max-w-lg w-full text-center">
        {/* Icon */}
        <div className="glass-card flex items-center justify-center w-20 h-20 rounded-2xl mx-auto mb-6 shadow-lg">
          <FileQuestion className="h-10 w-10 text-muted-foreground" />
        </div>

        {/* Error code */}
        <h1 className="text-7xl sm:text-8xl font-bold gradient-text mb-2">404</h1>
        <h2 className="text-xl font-semibold tracking-tight mb-3">
          Page not found
        </h2>
        <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
          The page you're looking for doesn't exist or has been moved.
          If you believe this is an error, please contact your administrator.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all text-sm font-medium w-full sm:w-auto"
          >
            <Home className="h-4 w-4" />
            Go to Dashboard
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md glass border-0 hover-lift transition-all text-sm font-medium w-full sm:w-auto"
          >
            <Search className="h-4 w-4" />
            Search documents
          </Link>
        </div>
      </div>
    </div>
  );
}
