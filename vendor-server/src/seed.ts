/**
 * Smart EDMS Vendor Server — Seed Script
 *
 * Creates the default admin user. Run after database setup.
 * Usage: bun run src/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.VENDOR_ADMIN_EMAIL || 'admin@smartedms.local';
  const password = process.env.VENDOR_ADMIN_PASSWORD || 'ChangeMe!2025';
  const name = process.env.VENDOR_ADMIN_NAME || 'Vendor Admin';

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await hash(password, 12);

  const admin = await prisma.adminUser.create({
    data: { email, name, passwordHash, role: 'superadmin' },
  });

  console.log('✅ Vendor admin user created:');
  console.log(`   Email: ${admin.email}`);
  console.log(`   Name: ${admin.name}`);
  console.log(`   Role: ${admin.role}`);
  console.log(`   Password: ${password} (change immediately!)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
