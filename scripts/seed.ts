/**
 * Smart EDMS — Database seed
 *
 * Boots the first tenant + admin user + system roles + default classifications.
 * Idempotent: re-running will not duplicate rows.
 *
 * Run with: bun run scripts/seed.ts
 */

import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/crypto';
import {
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
} from '../src/lib/auth/permissions';

const roleDescriptions: Record<string, string> = {
  [SYSTEM_ROLES.PLATFORM_ADMIN]: 'Platform superuser — full control across all tenants, billing, and lifecycle.',
  [SYSTEM_ROLES.TENANT_ADMIN]: 'Full tenant control (audit logs remain immutable).',
  [SYSTEM_ROLES.RECORDS_MANAGER]: 'Manage retention schedules, legal holds, and record declarations.',
  [SYSTEM_ROLES.SECURITY_OFFICER]: 'Manage classification, policies, and security posture.',
  [SYSTEM_ROLES.COMPLIANCE_AUDITOR]: 'Read-only access to audit logs and compliance evidence.',
  [SYSTEM_ROLES.END_USER]: 'Upload, manage, and share owned documents.',
  [SYSTEM_ROLES.VIEWER]: 'Read-only access to permitted documents.',
};

async function main() {
  console.log('🌱 Seeding Smart EDMS...');

  const tenantName = process.env.SEED_TENANT_NAME || 'Default Tenant';
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@smartedms.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!2025';
  const adminName = process.env.SEED_ADMIN_NAME || 'Smart EDMS Admin';

  // 1. Tenant
  const tenant = await db.tenant.upsert({
    where: { slug: 'default' },
    update: { name: tenantName },
    create: {
      name: tenantName,
      slug: 'default',
      status: 'active',
      settings: JSON.stringify({
        branding: { primary: '#0f172a', accent: '#0ea5e9' },
        features: { ai: true, watermark: true },
        residency: 'default',
      }),
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (${tenant.id})`);

  // 2. System roles
  const roleRecords: Record<string, { id: string }> = {};
  for (const [key, name] of Object.entries(SYSTEM_ROLES)) {
    const role = await db.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {
        permissions: JSON.stringify(SYSTEM_ROLE_PERMISSIONS[name] ?? []),
        isSystem: true,
        description: roleDescriptions[name] ?? '',
      },
      create: {
        tenantId: tenant.id,
        name,
        description: roleDescriptions[name] ?? '',
        permissions: JSON.stringify(SYSTEM_ROLE_PERMISSIONS[name] ?? []),
        isSystem: true,
      },
    });
    roleRecords[name] = role;
  }
  console.log(`  ✓ ${Object.keys(roleRecords).length} system roles`);

  // 3. Default classifications
  const classifications = [
    {
      code: 'PUBLIC',
      name: 'Public',
      description: 'Approved for public release. No restrictions on disclosure.',
      level: 0,
      color: '#16a34a',
      defaultPolicy: JSON.stringify({ shareAllowed: true, downloadAllowed: true, watermark: false }),
    },
    {
      code: 'INTERNAL',
      name: 'Internal',
      description: 'For internal use. May be shared with employees and contractors under NDA.',
      level: 1,
      color: '#2563eb',
      defaultPolicy: JSON.stringify({ shareAllowed: true, downloadAllowed: true, watermark: true }),
    },
    {
      code: 'CONFIDENTIAL',
      name: 'Confidential',
      description: 'Sensitive business information. Disclosure may cause measurable harm.',
      level: 2,
      color: '#d97706',
      defaultPolicy: JSON.stringify({ shareAllowed: false, downloadAllowed: true, watermark: true }),
    },
    {
      code: 'RESTRICTED',
      name: 'Restricted',
      description: 'Highly sensitive. Need-to-know basis. External sharing prohibited.',
      level: 3,
      color: '#dc2626',
      defaultPolicy: JSON.stringify({ shareAllowed: false, downloadAllowed: false, watermark: true }),
    },
    {
      code: 'HS',
      name: 'Highly Sensitive',
      description: 'Highest sensitivity. Includes regulated data (PII, PHI, secrets).',
      level: 4,
      color: '#7c2d12',
      defaultPolicy: JSON.stringify({ shareAllowed: false, downloadAllowed: false, watermark: true }),
    },
  ];
  for (const c of classifications) {
    await db.classification.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: c.code } },
      update: {},
      create: { ...c, tenantId: tenant.id, isSystem: true },
    });
  }
  console.log(`  ✓ ${classifications.length} default classifications`);

  // 4. Admin user
  // SECURITY: mustChangePassword=true forces the admin to change the default
  // password on first login. The JWT carries this flag; the API handler
  // blocks all non-/settings requests until the password is changed.
  const adminPasswordHash = await hashPassword(adminPassword);
  const admin = await db.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { passwordHash: adminPasswordHash, status: 'active', name: adminName, mustChangePassword: true },
    create: {
      tenantId: tenant.id,
      email: adminEmail,
      name: adminName,
      passwordHash: adminPasswordHash,
      status: 'active',
      mustChangePassword: true,
      jobTitle: 'Tenant Administrator',
      department: 'IT',
    },
  });
  console.log(`  ✓ Admin user: ${admin.email} (${admin.id})`);

  // 5. Assign tenant_admin role to admin
  await db.roleAssignment.upsert({
    where: {
      userId_roleId_scope: {
        userId: admin.id,
        roleId: roleRecords[SYSTEM_ROLES.TENANT_ADMIN].id,
        scope: '',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: admin.id,
      roleId: roleRecords[SYSTEM_ROLES.TENANT_ADMIN].id,
      scope: '',
    },
  });
  console.log(`  ✓ Admin role assignment: tenant_admin`);

  // 5b. Optionally seed a platform admin (set SEED_PLATFORM_ADMIN_EMAIL env var)
  const platformAdminEmail = process.env.SEED_PLATFORM_ADMIN_EMAIL;
  if (platformAdminEmail) {
    const platformAdminPassword = process.env.SEED_PLATFORM_ADMIN_PASSWORD || 'ChangeMe!2025';
    const platformAdminName = process.env.SEED_PLATFORM_ADMIN_NAME || 'Platform Admin';
    const platformPasswordHash = await hashPassword(platformAdminPassword);

    const platformAdmin = await db.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: platformAdminEmail.toLowerCase() } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: platformAdminEmail.toLowerCase(),
        name: platformAdminName,
        passwordHash: platformPasswordHash,
        status: 'active',
        jobTitle: 'Platform Administrator',
        department: 'Platform',
      },
    });

    await db.roleAssignment.upsert({
      where: {
        userId_roleId_scope: {
          userId: platformAdmin.id,
          roleId: roleRecords[SYSTEM_ROLES.PLATFORM_ADMIN].id,
          scope: '',
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: platformAdmin.id,
        roleId: roleRecords[SYSTEM_ROLES.PLATFORM_ADMIN].id,
        scope: '',
      },
    });
    console.log(`  ✓ Platform admin: ${platformAdmin.email} (${platformAdmin.id})`);
  }

  // 6. Default retention schedules
  const retentionSchedules = [
    {
      name: 'Default 7-year',
      description: 'Default retention: 7 years from document creation',
      retentionDays: 7 * 365,
      startTrigger: 'document.created',
      dispositionAction: 'review',
      requireApproval: true,
      appliesTo: '*',
    },
    {
      name: 'Financial records (7y)',
      description: 'Financial records — keep 7 years then delete',
      retentionDays: 7 * 365,
      startTrigger: 'document.created',
      dispositionAction: 'delete',
      requireApproval: true,
      appliesTo: 'invoice,financial',
    },
    {
      name: 'Contracts (10y)',
      description: 'Contracts — keep 10 years after creation',
      retentionDays: 10 * 365,
      startTrigger: 'document.created',
      dispositionAction: 'archive',
      requireApproval: true,
      appliesTo: 'contract',
    },
  ];
  for (const r of retentionSchedules) {
    await db.retentionSchedule.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: r.name } },
      update: {},
      create: { ...r, tenantId: tenant.id },
    });
  }
  console.log(`  ✓ ${retentionSchedules.length} retention schedules`);

  // 7. Default policies
  const defaultPolicies = [
    {
      name: 'deny-public-sharing-restricted',
      description: 'Deny external sharing of Restricted / Highly Sensitive documents',
      effect: 'deny',
      action: 'share:create',
      resource: 'document:*',
      conditions: JSON.stringify({ classification: ['RESTRICTED', 'HS'] }),
      priority: 200,
      enabled: true,
    },
    {
      name: 'deny-download-hs',
      description: 'Deny download of Highly Sensitive documents by non-admins',
      effect: 'deny',
      action: 'document:download',
      resource: 'document:*',
      conditions: JSON.stringify({ classification: ['HS'], requireRole: ['tenant_admin', 'security_officer'] }),
      priority: 200,
      enabled: true,
    },
    {
      name: 'allow-own-documents',
      description: 'Allow end users to manage their own documents',
      effect: 'allow',
      action: 'document:*',
      resource: 'document:own',
      conditions: JSON.stringify({}),
      priority: 100,
      enabled: true,
    },
  ];
  for (const p of defaultPolicies) {
    await db.policy.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: p.name } },
      update: {},
      create: { ...p, tenantId: tenant.id },
    });
  }
  console.log(`  ✓ ${defaultPolicies.length} default policies`);

  // 8. Default metadata schema
  await db.metadataSchema.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Default' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Default',
      description: 'Default metadata schema applicable to all documents',
      appliesTo: '*',
      fields: JSON.stringify([
        { name: 'businessOwner', label: 'Business Owner', type: 'text', required: false },
        { name: 'department', label: 'Department', type: 'text', required: false },
        { name: 'project', label: 'Project', type: 'text', required: false },
        { name: 'caseNumber', label: 'Case Number', type: 'text', required: false },
        { name: 'jurisdiction', label: 'Jurisdiction', type: 'text', required: false },
        { name: 'reviewDate', label: 'Next Review Date', type: 'date', required: false },
      ]),
    },
  });
  console.log(`  ✓ Default metadata schema`);

  console.log('\n✅ Seed complete.');
  console.log(`   Admin login: ${adminEmail}`);
  console.log(`   Admin password: ${adminPassword}`);
  console.log('   ⚠️  Change the admin password immediately after first login.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
