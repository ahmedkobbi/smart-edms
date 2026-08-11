#!/usr/bin/env node
/**
 * Smart EDMS — License Generator (Vendor Tool)
 *
 * Usage:
 *   bun run scripts/generate-license.ts \
 *     --tenant-id "<cuid>" \
 *     --tenant-name "Acme Corporation" \
 *     --seats 50 \
 *     --storage-gb 100 \
 *     --expires 2027-08-12 \
 *     --issued-by "Ahmed Kobbi" \
 *     --features "records_management,signatures,bpmn_designer,security_audit"
 *
 * Environment:
 *   LICENSE_SIGNING_SECRET — the HMAC signing secret (must match the server)
 *
 * Output:
 *   Prints the base64 license key to stdout.
 *   Save to a .license file and send to the customer.
 *   The customer uploads it via /admin/license or POST /api/license.
 */

import { createHmac } from 'crypto';

const args = process.argv.slice(2);
const opts: Record<string, string> = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--') && i + 1 < args.length) {
    opts[args[i].slice(2)] = args[i + 1];
    i++;
  }
}

const required = ['tenant-id', 'tenant-name', 'expires', 'issued-by'];
for (const key of required) {
  if (!opts[key]) {
    console.error(`Missing required argument: --${key}`);
    console.error('');
    console.error('Usage: bun run scripts/generate-license.ts \\');
    console.error('  --tenant-id "<cuid>" \\');
    console.error('  --tenant-name "Acme Corporation" \\');
    console.error('  --seats 50 \\');
    console.error('  --storage-gb 100 \\');
    console.error('  --expires 2027-08-12 \\');
    console.error('  --issued-by "Ahmed Kobbi" \\');
    console.error('  --features "records_management,signatures,bpmn_designer" \\');
    console.error('  --grace-days 30');
    process.exit(1);
  }
}

const secret = process.env.LICENSE_SIGNING_SECRET || 'smart-edms-license-signing-key-change-in-production';

const payload = {
  tenantId: opts['tenant-id'],
  tenantName: opts['tenant-name'],
  plan: opts.plan || 'enterprise',
  seats: parseInt(opts.seats || '25', 10),
  storageBytes: String((parseInt(opts['storage-gb'] || '5', 10)) * 1024 * 1024 * 1024),
  features: (opts.features || '').split(',').map(f => f.trim()).filter(Boolean),
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(opts.expires).toISOString(),
  gracePeriodDays: parseInt(opts['grace-days'] || '30', 10),
  issuedBy: opts['issued-by'],
};

// Sign the payload
const canonical = JSON.stringify(payload, Object.keys(payload).sort());
const signature = createHmac('sha256', secret).update(canonical).digest('hex');

// Generate the license key (base64-encoded JSON with payload + signature)
const licenseObject = { ...payload, signature };
const licenseKey = Buffer.from(JSON.stringify(licenseObject)).toString('base64');

console.log('=== Smart EDMS License Generated ===');
console.log('');
console.log(`Tenant:       ${payload.tenantName} (${payload.tenantId})`);
console.log(`Plan:         ${payload.plan}`);
console.log(`Seats:        ${payload.seats}`);
console.log(`Storage:      ${(Number(payload.storageBytes) / 1024 / 1024 / 1024).toFixed(0)} GB`);
console.log(`Features:     ${payload.features.join(', ') || 'none'}`);
console.log(`Issued at:    ${payload.issuedAt}`);
console.log(`Expires at:   ${payload.expiresAt}`);
console.log(`Grace period: ${payload.gracePeriodDays} days`);
console.log(`Issued by:    ${payload.issuedBy}`);
console.log('');
console.log('=== License Key (copy this, save as .license file) ===');
console.log('');
console.log(licenseKey);
console.log('');
console.log('=== Instructions for customer ===');
console.log('1. Save the license key above to a file named smart-edms.license');
console.log('2. Log in to Smart EDMS as tenant admin');
console.log('3. Go to Admin → License Management');
console.log('4. Paste the license key and click "Install"');
console.log('');
