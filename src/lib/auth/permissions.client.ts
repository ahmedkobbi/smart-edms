/**
 * Client-safe permission helpers
 * (mirrors server-side src/lib/auth/permissions.ts but re-exported for browser)
 */

export * from './permissions';

export { hasPermission, hasAnyPermission, hasAllPermissions, permissionMatches } from './permissions';
