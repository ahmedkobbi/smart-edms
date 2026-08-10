/**
 * Smart EDMS — Permission system tests
 *
 * Tests:
 *   - Exact permission matching
 *   - Wildcard matching (domain:*)
 *   - Global wildcard (*)
 *   - hasPermission, hasAnyPermission, hasAllPermissions
 *   - System role permission catalogs
 */

import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
  permissionMatches,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from '@/lib/auth/permissions';

describe('Permission Matching', () => {
  it('matches exact permission', () => {
    expect(permissionMatches('document:read', 'document:read')).toBe(true);
  });

  it('does not match different permissions', () => {
    expect(permissionMatches('document:read', 'document:write')).toBe(false);
    expect(permissionMatches('document:read', 'user:read')).toBe(false);
  });

  it('matches domain wildcard (document:*)', () => {
    expect(permissionMatches('document:*', 'document:read')).toBe(true);
    expect(permissionMatches('document:*', 'document:write')).toBe(true);
    expect(permissionMatches('document:*', 'document:anything')).toBe(true);
  });

  it('does not match wildcard across domains', () => {
    expect(permissionMatches('document:*', 'user:read')).toBe(false);
    expect(permissionMatches('document:*', 'admin:users.manage')).toBe(false);
  });

  it('matches global wildcard (*)', () => {
    expect(permissionMatches('*', 'document:read')).toBe(true);
    expect(permissionMatches('*', 'admin:users.manage')).toBe(true);
    expect(permissionMatches('*', 'anything:at.all')).toBe(true);
  });

  it('does not match partial wildcards incorrectly', () => {
    // document:* should NOT match documents:read (different domain)
    expect(permissionMatches('document:*', 'documents:read')).toBe(false);
  });
});

describe('hasPermission', () => {
  it('returns true when permission is in granted list', () => {
    expect(hasPermission(['document:read', 'document:write'], 'document:read')).toBe(true);
  });

  it('returns false when permission is not in granted list', () => {
    expect(hasPermission(['document:read'], 'document:delete')).toBe(false);
  });

  it('returns true when wildcard is in granted list', () => {
    expect(hasPermission(['document:*'], 'document:read')).toBe(true);
    expect(hasPermission(['*'], 'document:read')).toBe(true);
  });

  it('handles empty granted list', () => {
    expect(hasPermission([], 'document:read')).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('returns true if any required permission is granted', () => {
    expect(hasAnyPermission(['document:read'], ['document:write', 'document:read'])).toBe(true);
  });

  it('returns false if none of the required permissions are granted', () => {
    expect(hasAnyPermission(['document:read'], ['document:write', 'document:delete'])).toBe(false);
  });

  it('returns true if wildcard grants any', () => {
    expect(hasAnyPermission(['admin:*'], ['admin:users.manage', 'admin:roles.manage'])).toBe(true);
  });
});

describe('hasAllPermissions', () => {
  it('returns true when all required permissions are granted', () => {
    expect(hasAllPermissions(['document:read', 'document:write'], ['document:read', 'document:write'])).toBe(true);
  });

  it('returns false when one is missing', () => {
    expect(hasAllPermissions(['document:read'], ['document:read', 'document:write'])).toBe(false);
  });

  it('returns true for empty required list', () => {
    expect(hasAllPermissions(['document:read'], [])).toBe(true);
  });
});

describe('System Roles', () => {
  it('defines all 6 system roles', () => {
    expect(Object.keys(SYSTEM_ROLES)).toHaveLength(6);
    expect(SYSTEM_ROLES.TENANT_ADMIN).toBe('tenant_admin');
    expect(SYSTEM_ROLES.END_USER).toBe('end_user');
    expect(SYSTEM_ROLES.VIEWER).toBe('viewer');
  });

  it('tenant_admin has all permissions', () => {
    const adminPerms = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.TENANT_ADMIN];
    expect(adminPerms).toContain(PERMISSIONS.DOCUMENT_CREATE);
    expect(adminPerms).toContain(PERMISSIONS.DOCUMENT_DELETE);
    expect(adminPerms).toContain(PERMISSIONS.ADMIN_USERS_MANAGE);
    expect(adminPerms).toContain(PERMISSIONS.AUDIT_EXPORT);
    expect(adminPerms.length).toBeGreaterThan(30);
  });

  it('end_user cannot delete documents', () => {
    const userPerms = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.END_USER];
    expect(userPerms).toContain(PERMISSIONS.DOCUMENT_CREATE);
    expect(userPerms).not.toContain(PERMISSIONS.DOCUMENT_DELETE);
  });

  it('end_user cannot manage admin functions', () => {
    const userPerms = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.END_USER];
    expect(userPerms).not.toContain(PERMISSIONS.ADMIN_USERS_MANAGE);
    expect(userPerms).not.toContain(PERMISSIONS.ADMIN_ROLES_MANAGE);
  });

  it('viewer has only read permissions', () => {
    const viewerPerms = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VIEWER];
    expect(viewerPerms).toContain(PERMISSIONS.DOCUMENT_READ);
    expect(viewerPerms).toContain(PERMISSIONS.DOCUMENT_PREVIEW);
    expect(viewerPerms).not.toContain(PERMISSIONS.DOCUMENT_CREATE);
    expect(viewerPerms).not.toContain(PERMISSIONS.DOCUMENT_UPDATE);
    expect(viewerPerms).not.toContain(PERMISSIONS.DOCUMENT_DELETE);
  });

  it('compliance_auditor has audit read + export but not admin manage', () => {
    const auditorPerms = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.COMPLIANCE_AUDITOR];
    expect(auditorPerms).toContain(PERMISSIONS.AUDIT_READ);
    expect(auditorPerms).toContain(PERMISSIONS.AUDIT_EXPORT);
    expect(auditorPerms).not.toContain(PERMISSIONS.ADMIN_USERS_MANAGE);
  });

  it('records_manager can manage retention and legal holds', () => {
    const rmPerms = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.RECORDS_MANAGER];
    expect(rmPerms).toContain(PERMISSIONS.RETENTION_MANAGE);
    expect(rmPerms).toContain(PERMISSIONS.LEGAL_HOLD_MANAGE);
    expect(rmPerms).toContain(PERMISSIONS.DOCUMENT_DECLARE_RECORD);
  });

  it('security_officer can manage classifications and verify audit', () => {
    const soPerms = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.SECURITY_OFFICER];
    expect(soPerms).toContain(PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE);
    expect(soPerms).toContain(PERMISSIONS.AUDIT_VERIFY_INTEGRITY);
    expect(soPerms).toContain(PERMISSIONS.DOCUMENT_CLASSIFY_DOWNGRADE);
  });
});

describe('PERMISSIONS constant', () => {
  it('defines document permissions', () => {
    expect(PERMISSIONS.DOCUMENT_CREATE).toBe('document:create');
    expect(PERMISSIONS.DOCUMENT_READ).toBe('document:read');
    expect(PERMISSIONS.DOCUMENT_DELETE).toBe('document:delete');
    expect(PERMISSIONS.DOCUMENT_DOWNLOAD).toBe('document:download');
  });

  it('defines admin permissions', () => {
    expect(PERMISSIONS.ADMIN_USERS_MANAGE).toBe('admin:users.manage');
    expect(PERMISSIONS.ADMIN_TENANT_MANAGE).toBe('admin:tenant.manage');
  });

  it('defines audit permissions', () => {
    expect(PERMISSIONS.AUDIT_READ).toBe('audit:read');
    expect(PERMISSIONS.AUDIT_EXPORT).toBe('audit:export');
    expect(PERMISSIONS.AUDIT_VERIFY_INTEGRITY).toBe('audit:verify');
  });
});
