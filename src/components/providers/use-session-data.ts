'use client';

import { useSession } from 'next-auth/react';

/**
 * Reads the NextAuth session for client components.
 * The session is augmented server-side with roles, permissions, tenantId.
 */
export function useSessionData() {
  const { data: session, status } = useSession();
  return { session: session as any, status };
}
