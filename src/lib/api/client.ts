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
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
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
    throw new ApiRequestError(
      res.status,
      err?.code || 'unknown',
      err?.message || `HTTP ${res.status}`,
    );
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
