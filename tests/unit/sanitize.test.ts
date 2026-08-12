import { describe, it, expect } from 'vitest';
import { sanitizeObject, safeJsonParse } from '@/lib/security/sanitize';

describe('Prototype Pollution Sanitizer', () => {
  it('removes __proto__ key', () => {
    const input = { name: 'test', __proto__: { isAdmin: true } };
    const result = sanitizeObject(input);
    expect(result).toEqual({ name: 'test' });
    expect(({} as any).isAdmin).toBeUndefined(); // prototype not polluted
  });

  it('removes constructor key', () => {
    const input = { name: 'test', constructor: { prototype: { isAdmin: true } } };
    const result = sanitizeObject(input);
    expect(result).toEqual({ name: 'test' });
  });

  it('removes prototype key', () => {
    const input = { name: 'test', prototype: { isAdmin: true } };
    const result = sanitizeObject(input);
    expect(result).toEqual({ name: 'test' });
  });

  it('recursively sanitizes nested objects', () => {
    const input = {
      level1: {
        level2: {
          __proto__: { polluted: true },
          valid: 'yes',
        },
      },
    };
    const result = sanitizeObject(input);
    expect(result.level1.level2.valid).toBe('yes');
    // The __proto__ key should not be a regular own property
    expect(Object.keys(result.level1.level2)).not.toContain('__proto__');
    expect(Object.getOwnPropertyDescriptor(result.level1.level2, '__proto__')).toBeUndefined();
  });

  it('sanitizes arrays containing polluted objects', () => {
    const input = [{ name: 'a', __proto__: { x: 1 } }, { name: 'b' }];
    const result = sanitizeObject(input);
    expect(result[0]).toEqual({ name: 'a' });
    expect(result[1]).toEqual({ name: 'b' });
  });

  it('preserves valid nested objects', () => {
    const input = { a: { b: { c: 'd' } }, e: [1, 2, 3] };
    const result = sanitizeObject(input);
    expect(result).toEqual(input);
  });

  it('handles null and primitives', () => {
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject(undefined)).toBeUndefined();
    expect(sanitizeObject(42)).toBe(42);
    expect(sanitizeObject('hello')).toBe('hello');
    expect(sanitizeObject(true)).toBe(true);
  });

  it('does not pollute Object.prototype after sanitization', () => {
    const input = JSON.parse('{"__proto__": {"polluted": true}}');
    sanitizeObject(input);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('safeJsonParse sanitizes the result', () => {
    const json = '{"name":"test","__proto__":{"isAdmin":true}}';
    const result = safeJsonParse(json, { name: 'fallback' });
    expect(result).toEqual({ name: 'test' });
    expect(({} as any).isAdmin).toBeUndefined();
  });

  it('safeJsonParse returns fallback on invalid JSON', () => {
    const result = safeJsonParse('not json', { default: true });
    expect(result).toEqual({ default: true });
  });
});
