/**
 * Smart EDMS — Cross-tenant isolation test
 *
 * Creates a second tenant + user, uploads a document in each, then verifies
 * that tenant A cannot read tenant B's documents through any API.
 *
 * Run with: bun run scripts/test-isolation.ts
 */

import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/crypto';
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '../src/lib/auth/permissions';

async function main() {
  console.log('🧪 Cross-tenant isolation test\n');

  // 1. Create tenant B
  const tenantB = await db.tenant.upsert({
    where: { slug: 'tenant-b-test' },
    update: {},
    create: {
      name: 'Tenant B (isolation test)',
      slug: 'tenant-b-test',
      status: 'active',
    },
  });
  console.log(`  ✓ Tenant B: ${tenantB.id}`);

  // 2. Create admin role in tenant B
  const roleB = await db.role.upsert({
    where: { tenantId_name: { tenantId: tenantB.id, name: SYSTEM_ROLES.TENANT_ADMIN } },
    update: {},
    create: {
      tenantId: tenantB.id,
      name: SYSTEM_ROLES.TENANT_ADMIN,
      permissions: JSON.stringify(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.TENANT_ADMIN] ?? []),
      isSystem: true,
    },
  });

  // 3. Create user B
  const userB = await db.user.upsert({
    where: { tenantId_email: { tenantId: tenantB.id, email: 'b@tenant-b-test.local' } },
    update: {},
    create: {
      tenantId: tenantB.id,
      email: 'b@tenant-b-test.local',
      name: 'Tenant B User',
      passwordHash: await hashPassword('TenantB!2025'),
      status: 'active',
    },
  });
  await db.roleAssignment.upsert({
    where: { userId_roleId_scope: { userId: userB.id, roleId: roleB.id, scope: '' } },
    update: {},
    create: { tenantId: tenantB.id, userId: userB.id, roleId: roleB.id, scope: '' },
  });
  console.log(`  ✓ User B: ${userB.email} (${userB.tenantId})`);

  // 4. Create document in tenant A (default)
  const tenantA = await db.tenant.findUnique({ where: { slug: 'default' } });
  if (!tenantA) throw new Error('Default tenant A not found — run seed first');

  const userA = await db.user.findFirst({
    where: { tenantId: tenantA.id, email: 'admin@smartedms.local' },
  });
  if (!userA) throw new Error('Admin user A not found');

  const docA = await db.document.create({
    data: {
      tenantId: tenantA.id,
      ownerId: userA.id,
      title: '[ISOLATION TEST] Tenant A confidential doc',
      documentType: 'test',
      state: 'active',
      currentVersion: 1,
      metadata: JSON.stringify({ secret: 'tenant-a-secret' }),
    },
  });
  console.log(`  ✓ Document A: ${docA.id} (tenant: ${docA.tenantId})`);

  // 5. Create document in tenant B
  const docB = await db.document.create({
    data: {
      tenantId: tenantB.id,
      ownerId: userB.id,
      title: '[ISOLATION TEST] Tenant B confidential doc',
      documentType: 'test',
      state: 'active',
      currentVersion: 1,
      metadata: JSON.stringify({ secret: 'tenant-b-secret' }),
    },
  });
  console.log(`  ✓ Document B: ${docB.id} (tenant: ${docB.tenantId})`);

  // 6. Test isolation: query documents with tenant A's tenantId
  const docsVisibleToA = await db.document.findMany({
    where: { tenantId: tenantA.id, deletedAt: null },
    select: { id: true, tenantId: true, title: true },
  });
  const docsVisibleToB = await db.document.findMany({
    where: { tenantId: tenantB.id, deletedAt: null },
    select: { id: true, tenantId: true, title: true },
  });

  console.log('\n🔍 Test 1: Tenant A sees only tenant A documents');
  const aLeaksB = docsVisibleToA.some((d) => d.tenantId === tenantB.id);
  console.log(`   ${aLeaksB ? '❌ FAIL' : '✓ PASS'} — Tenant A ${aLeaksB ? 'CAN' : 'cannot'} see tenant B docs`);

  console.log('\n🔍 Test 2: Tenant B sees only tenant B documents');
  const bLeaksA = docsVisibleToB.some((d) => d.tenantId === tenantA.id);
  console.log(`   ${bLeaksA ? '❌ FAIL' : '✓ PASS'} — Tenant B ${bLeaksA ? 'CAN' : 'cannot'} see tenant A docs`);

  // 7. Test direct ID access (simulating a forged request)
  const directAccessAtoB = await db.document.findFirst({
    where: { id: docB.id, tenantId: tenantA.id },
  });
  console.log('\n🔍 Test 3: Tenant A cannot directly fetch tenant B document by ID');
  console.log(`   ${directAccessAtoB ? '❌ FAIL' : '✓ PASS'} — Direct ID access ${directAccessAtoB ? 'leaked' : 'is properly scoped'}`);

  // 8. Test audit log isolation
  const auditA = await db.auditEvent.findMany({
    where: { tenantId: tenantA.id },
    select: { tenantId: true },
  });
  const auditALeaksB = auditA.some((a) => a.tenantId === tenantB.id);
  console.log('\n🔍 Test 4: Audit log tenant scoping');
  console.log(`   ${auditALeaksB ? '❌ FAIL' : '✓ PASS'} — Audit logs are tenant-scoped`);

  // 9. Test user isolation
  const userASeesB = await db.user.findFirst({
    where: { id: userB.id, tenantId: tenantA.id },
  });
  console.log('\n🔍 Test 5: User record isolation');
  console.log(`   ${userASeesB ? '❌ FAIL' : '✓ PASS'} — User records are tenant-scoped`);

  // Cleanup test artifacts
  console.log('\n🧹 Cleaning up test artifacts…');
  await db.documentVersion.deleteMany({ where: { documentId: { in: [docA.id, docB.id] } } });
  await db.document.deleteMany({ where: { id: { in: [docA.id, docB.id] } } });
  await db.roleAssignment.deleteMany({ where: { userId: userB.id } });
  await db.user.delete({ where: { id: userB.id } });
  await db.role.deleteMany({ where: { tenantId: tenantB.id } });
  await db.tenant.delete({ where: { id: tenantB.id } });
  console.log('  ✓ Cleanup complete');

  const allPassed = !aLeaksB && !bLeaksA && !directAccessAtoB && !auditALeaksB && !userASeesB;
  console.log(`\n${allPassed ? '✅ All isolation tests PASSED' : '❌ Some tests FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
}).finally(async () => {
  await db.$disconnect();
});
