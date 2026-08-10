/**
 * Smart EDMS — Typed API client for browser
 */

export interface ApiError {
  error: {
    code: string;
    message: string;
    [k: string]: unknown;
  };
}

export class ApiRequestError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  opts: { signal?: AbortSignal } = {},
): Promise<T> {
  // SECURITY FIX (L-INFRA-8): Always send `X-Requested-With: XMLHttpRequest`
  // on every request — including bodyless DELETEs — so the server-side CSRF
  // check (`isApiRequest` in handler.ts) accepts the request. Without this
  // header, bodyless DELETE requests with session-cookie auth fail with
  // 403 `csrf_missing` because the check requires Content-Type: application/json
  // OR X-Requested-With OR Authorization.
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: opts.signal,
    credentials: 'same-origin',
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  if (!res.ok) {
    const err = (json as ApiError)?.error;
    const error = new ApiRequestError(
      res.status,
      err?.code || 'unknown',
      err?.message || `HTTP ${res.status}`,
    );
    // Auto-redirect on auth errors — the user's session is invalid or
    // they lack permission. Redirect to the premium /unauthorized page
    // with the error code + message as query params.
    if (res.status === 401 && typeof window !== 'undefined') {
      const params = new URLSearchParams({
        code: err?.code || '401',
        message: err?.message || 'Your session has expired. Please sign in again.',
      });
      window.location.href = `/unauthorized?${params.toString()}`;
    }
    throw error;
  }
  return json as T;
}

export const api = {
  get: <T>(url: string, opts?: { signal?: AbortSignal }) => request<T>('GET', url, undefined, opts),
  post: <T>(url: string, body?: unknown, opts?: { signal?: AbortSignal }) => request<T>('POST', url, body, opts),
  patch: <T>(url: string, body?: unknown, opts?: { signal?: AbortSignal }) => request<T>('PATCH', url, body, opts),
  put: <T>(url: string, body?: unknown, opts?: { signal?: AbortSignal }) => request<T>('PUT', url, body, opts),
  delete: <T>(url: string, opts?: { signal?: AbortSignal }) => request<T>('DELETE', url, undefined, opts),
};

export async function uploadFile(url: string, formData: FormData): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    // SECURITY FIX (L-INFRA-8): Include X-Requested-With for CSRF check.
    // Do NOT set Content-Type for FormData — the browser sets the multipart
    // boundary automatically.
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: formData,
    credentials: 'same-origin',
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
  }
  if (!res.ok) {
    const err = (json as ApiError)?.error;
    throw new ApiRequestError(res.status, err?.code || 'unknown', err?.message || `HTTP ${res.status}`);
  }
  return json;
}
