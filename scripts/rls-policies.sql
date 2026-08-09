-- Smart EDMS — Row-Level Security (RLS) policies for PostgreSQL
--
-- Run this after prisma db push / migrate.
-- Enables RLS on all tenant-scoped tables and creates isolation policies.
--
-- WARNING: This does NOT replace application-level tenantId filtering.
-- It is a defense-in-depth measure — if a query accidentally omits the
-- tenantId WHERE clause, RLS blocks the cross-tenant leak.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/rls-policies.sql

BEGIN;

-- Helper function: reads the current tenant from session settings
-- Set via: SET LOCAL app.tenant_id = '<tenant-id>';
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS TEXT AS $$
  BEGIN
    RETURN current_setting('app.tenant_id', true);
  END;
$$ LANGUAGE plpgsql STABLE;

-- Tables that have a tenantId column
DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'User', 'Document', 'DocumentVersion', 'AuditEvent', 'Folder',
    'Classification', 'Role', 'RoleAssignment', 'Policy', 'Group',
    'GroupMember', 'Share', 'Workflow', 'Approval', 'RetentionSchedule',
    'LegalHold', 'Notification', 'ApiKey', 'Webhook', 'Session',
    'DocumentComment', 'Favorite', 'RecentView', 'SavedSearch',
    'Redaction', 'DispositionRecord', 'ServiceAccount', 'StepUpSession',
    'DocumentEncryptionKey', 'MalwareScan', 'ControlledVocabulary',
    'Invitation', 'RecertificationCampaign', 'RecertificationItem',
    'BreakGlassAccess', 'SsoProvider', 'AuditReceipt', 'Subscription',
    'DocumentTextIndex', 'SecurityAnomaly'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE "%I" ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE "%I" FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON "%I" USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());',
      t
    );
  END LOOP;
END $$;

COMMIT;

-- Verify
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
