/**
 * Smart EDMS — Prototype Pollution Sanitizer
 *
 * Defense-in-depth against prototype pollution attacks. While Zod strips
 * unknown keys by default, this provides an additional layer of protection
 * for any object that comes from user input (JSON.parse, req.json(), etc.)
 * and gets spread (`...body`) into other objects.
 *
 * Usage:
 *   const body = sanitizeObject(await req.json());
 *   // or automatically via createApiHandler (future)
 */

/**
 * Recursively remove `__proto__`, `constructor`, and `prototype` keys
 * from an object and all nested objects/arrays.
 *
 * This prevents prototype pollution where an attacker sends:
 *   { "__proto__": { "isAdmin": true } }
 *   { "constructor": { "prototype": { "isAdmin": true } } }
 *
 * These keys would otherwise be spread into other objects via `...body`
 * and could modify Object.prototype globally.
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject) as unknown as T;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Skip prototype-polluting keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    // Recursively sanitize nested objects
    clean[key] = typeof value === 'object' && value !== null ? sanitizeObject(value) : value;
  }
  return clean as T;
}

/**
 * Safe JSON.parse that also sanitizes the result against prototype pollution.
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return sanitizeObject(parsed);
  } catch {
    return fallback;
  }
}
