/**
 * Smart EDMS — Permissions catalogue
 *
 * Permissions follow `domain:action` convention.
 * System roles ship with the following baseline grants; tenant admins may
 * refine via custom Roles + Policies (ABAC conditions).
 */

export type Permission = string;

export const PERMISSIONS = {
  // Documents
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_READ: 'document:read',
  DOCUMENT_READ_OWN: 'document:read.own',
  DOCUMENT_UPDATE: 'document:update',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_DOWNLOAD: 'document:download',
  DOCUMENT_PREVIEW: 'document:preview',
  DOCUMENT_SHARE: 'document:share',
  DOCUMENT_REDACT: 'document:redact',
  DOCUMENT_VERSION_RESTORE: 'document:version.restore',
  DOCUMENT_LOCK: 'document:lock',
  DOCUMENT_UNLOCK: 'document:unlock',
  DOCUMENT_DECLARE_RECORD: 'document:record.declare',
  DOCUMENT_CLASSIFY: 'document:classify',
  DOCUMENT_CLASSIFY_DOWNGRADE: 'document:classify.downgrade',

  // Workflow
  WORKFLOW_CREATE: 'workflow:create',
  WORKFLOW_APPROVE: 'workflow:approve',
  WORKFLOW_DELEGATE: 'workflow:delegate',
  WORKFLOW_CANCEL: 'workflow:cancel',

  // Retention / Legal Hold
  RETENTION_MANAGE: 'retention:manage',
  RETENTION_DISPOSITION_APPROVE: 'retention:disposition.approve',
  LEGAL_HOLD_MANAGE: 'legal-hold:manage',
  LEGAL_HOLD_RELEASE: 'legal-hold:release',

  // Audit
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',
  AUDIT_VERIFY_INTEGRITY: 'audit:verify',

  // Admin
  ADMIN_USERS_MANAGE: 'admin:users.manage',
  ADMIN_GROUPS_MANAGE: 'admin:groups.manage',
  ADMIN_ROLES_MANAGE: 'admin:roles.manage',
  ADMIN_POLICIES_MANAGE: 'admin:policies.manage',
  ADMIN_CLASSIFICATIONS_MANAGE: 'admin:classifications.manage',
  ADMIN_RETENTION_MANAGE: 'admin:retention.manage',
  ADMIN_TENANT_MANAGE: 'admin:tenant.manage',
  // SECURITY FIX (C4): New permission for creating new tenants.
  // Only platform-level admins should have this, NOT tenant_admin.
  ADMIN_PLATFORM_TENANT_CREATE: 'admin:platform.tenant.create',
  ADMIN_API_KEYS_MANAGE: 'admin:apikeys.manage',
  ADMIN_WEBHOOKS_MANAGE: 'admin:webhooks.manage',
  ADMIN_INTEGRATIONS_MANAGE: 'admin:integrations.manage',
  ADMIN_VIEW: 'admin:view',

  // AI
  AI_SUGGESTION_REVIEW: 'ai:suggestion.review',
  AI_SUGGESTION_REQUEST: 'ai:suggestion.request',

  // Sharing (external)
  SHARE_CREATE: 'share:create',
  SHARE_REVOKE: 'share:revoke',
  SHARE_VIEW: 'share:view',

  // Search
  SEARCH_USE: 'search:use',

  // Notifications
  NOTIFICATION_READ: 'notification:read',
} as const;

export const SYSTEM_ROLES = {
  TENANT_ADMIN: 'tenant_admin',
  RECORDS_MANAGER: 'records_manager',
  SECURITY_OFFICER: 'security_officer',
  COMPLIANCE_AUDITOR: 'compliance_auditor',
  END_USER: 'end_user',
  VIEWER: 'viewer',
} as const;

export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  [SYSTEM_ROLES.TENANT_ADMIN]: [
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_UPDATE,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
    PERMISSIONS.DOCUMENT_PREVIEW,
    PERMISSIONS.DOCUMENT_SHARE,
    PERMISSIONS.DOCUMENT_REDACT,
    PERMISSIONS.DOCUMENT_VERSION_RESTORE,
    PERMISSIONS.DOCUMENT_LOCK,
    PERMISSIONS.DOCUMENT_UNLOCK,
    PERMISSIONS.DOCUMENT_DECLARE_RECORD,
    PERMISSIONS.DOCUMENT_CLASSIFY,
    PERMISSIONS.DOCUMENT_CLASSIFY_DOWNGRADE,
    PERMISSIONS.WORKFLOW_CREATE,
    PERMISSIONS.WORKFLOW_APPROVE,
    PERMISSIONS.WORKFLOW_DELEGATE,
    PERMISSIONS.WORKFLOW_CANCEL,
    PERMISSIONS.RETENTION_MANAGE,
    PERMISSIONS.RETENTION_DISPOSITION_APPROVE,
    PERMISSIONS.LEGAL_HOLD_MANAGE,
    PERMISSIONS.LEGAL_HOLD_RELEASE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_EXPORT,
    PERMISSIONS.AUDIT_VERIFY_INTEGRITY,
    PERMISSIONS.ADMIN_USERS_MANAGE,
    PERMISSIONS.ADMIN_GROUPS_MANAGE,
    PERMISSIONS.ADMIN_ROLES_MANAGE,
    PERMISSIONS.ADMIN_POLICIES_MANAGE,
    PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE,
    PERMISSIONS.ADMIN_RETENTION_MANAGE,
    PERMISSIONS.ADMIN_TENANT_MANAGE,
    PERMISSIONS.ADMIN_API_KEYS_MANAGE,
    PERMISSIONS.ADMIN_WEBHOOKS_MANAGE,
    PERMISSIONS.ADMIN_INTEGRATIONS_MANAGE,
    PERMISSIONS.ADMIN_VIEW,
    PERMISSIONS.AI_SUGGESTION_REVIEW,
    PERMISSIONS.AI_SUGGESTION_REQUEST,
    PERMISSIONS.SHARE_CREATE,
    PERMISSIONS.SHARE_REVOKE,
    PERMISSIONS.SHARE_VIEW,
    PERMISSIONS.SEARCH_USE,
    PERMISSIONS.NOTIFICATION_READ,
  ],
  [SYSTEM_ROLES.RECORDS_MANAGER]: [
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_PREVIEW,
    PERMISSIONS.DOCUMENT_DECLARE_RECORD,
    PERMISSIONS.DOCUMENT_VERSION_RESTORE,
    PERMISSIONS.RETENTION_MANAGE,
    PERMISSIONS.RETENTION_DISPOSITION_APPROVE,
    PERMISSIONS.LEGAL_HOLD_MANAGE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ADMIN_VIEW,
    PERMISSIONS.SEARCH_USE,
    PERMISSIONS.NOTIFICATION_READ,
  ],
  [SYSTEM_ROLES.SECURITY_OFFICER]: [
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_PREVIEW,
    PERMISSIONS.DOCUMENT_CLASSIFY,
    PERMISSIONS.DOCUMENT_CLASSIFY_DOWNGRADE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_EXPORT,
    PERMISSIONS.AUDIT_VERIFY_INTEGRITY,
    PERMISSIONS.ADMIN_POLICIES_MANAGE,
    PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE,
    PERMISSIONS.ADMIN_VIEW,
    PERMISSIONS.AI_SUGGESTION_REVIEW,
    PERMISSIONS.SEARCH_USE,
    PERMISSIONS.NOTIFICATION_READ,
  ],
  [SYSTEM_ROLES.COMPLIANCE_AUDITOR]: [
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_PREVIEW,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_EXPORT,
    PERMISSIONS.ADMIN_VIEW,
    PERMISSIONS.SEARCH_USE,
    PERMISSIONS.NOTIFICATION_READ,
  ],
  [SYSTEM_ROLES.END_USER]: [
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_READ_OWN,
    PERMISSIONS.DOCUMENT_UPDATE,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
    PERMISSIONS.DOCUMENT_PREVIEW,
    PERMISSIONS.DOCUMENT_SHARE,
    PERMISSIONS.WORKFLOW_CREATE,
    PERMISSIONS.WORKFLOW_APPROVE,
    PERMISSIONS.SHARE_CREATE,
    PERMISSIONS.SHARE_REVOKE,
    PERMISSIONS.AI_SUGGESTION_REQUEST,
    PERMISSIONS.SEARCH_USE,
    PERMISSIONS.NOTIFICATION_READ,
  ],
  [SYSTEM_ROLES.VIEWER]: [
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_PREVIEW,
    PERMISSIONS.SEARCH_USE,
    PERMISSIONS.NOTIFICATION_READ,
  ],
};

export function permissionMatches(granted: string, required: string): boolean {
  if (granted === '*') return true;
  if (granted === required) return true;
  if (granted.endsWith(':*')) {
    const prefix = granted.slice(0, -1);
    return required.startsWith(prefix);
  }
  return false;
}

export function hasPermission(granted: string[], required: string): boolean {
  return granted.some((g) => permissionMatches(g, required));
}

export function hasAnyPermission(granted: string[], required: string[]): boolean {
  return required.some((r) => hasPermission(granted, r));
}

export function hasAllPermissions(granted: string[], required: string[]): boolean {
  return required.every((r) => hasPermission(granted, r));
}
