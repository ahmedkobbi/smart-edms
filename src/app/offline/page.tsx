/**
 * Smart EDMS — Offline fallback page
 *
 * Displayed when the network is lost and the service worker can't serve
 * cached content. Uses the premium glassmorphism design system to
 * maintain brand consistency even in error states.
 */

import { ShieldOff, RefreshCw } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center mesh-bg p-4">
      <div className="glass-strong rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
        <div className="glass-card flex items-center justify-center w-16 h-16 rounded-2xl mx-auto mb-6 shadow-lg">
          <ShieldOff className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          You're offline
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Smart EDMS can't reach the server. Check your internet connection
          and try again. Your data is safe — once you're back online, all
          changes will sync automatically.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
