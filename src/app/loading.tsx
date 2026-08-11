/**
 * Smart EDMS — Route-level loading fallback
 *
 * Premium glassmorphism loading state shown by Next.js App Router while
 * a route segment is being rendered (server component data fetch, etc).
 * Uses the DualSpinner from the premium component library.
 */

import { DualSpinner } from '@/components/ui/premium';

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <DualSpinner />
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      </div>
    </div>
  );
}
