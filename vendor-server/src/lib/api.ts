/**
 * Smart EDMS Vendor Server — API Client
 *
 * Wraps fetch() with:
 * - Response validation (throws on non-2xx)
 * - Auto-redirect to /login on 401
 * - Consistent error handling
 */

export async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  // Handle 401 — redirect to login
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Authentication required');
  }

  // Parse JSON
  const data = await res.json().catch(() => ({ error: { message: 'Invalid response' } }));

  // Handle non-2xx
  if (!res.ok) {
    const message = data?.error?.message || `Request failed: ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}
