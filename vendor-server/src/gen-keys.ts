/**
 * Smart EDMS Vendor Server — Key Generation Script
 *
 * Run this ONCE to generate your Ed25519 key pair.
 * The private key goes in your .env (VENDOR_ED25519_PRIVATE_KEY).
 * The public key goes in your .env AND in the on-prem app's anti-crack.ts.
 *
 * Usage: bun run src/gen-keys.ts
 */

import { generateEd25519KeyPair } from './lib/license-signing';
import { writeFileSync } from 'fs';

console.log('🔐 Smart EDMS — Vendor Key Generation\n');
console.log('Generating Ed25519 key pair...\n');

const { privateKeyPem, publicKeyPem, publicKeyBase64 } = generateEd25519KeyPair();

console.log('=== PRIVATE KEY (keep SECRET — NEVER commit, NEVER share) ===');
console.log(privateKeyPem);
console.log('\n=== PUBLIC KEY (safe to share — embed in on-prem app) ===');
console.log(publicKeyPem);
console.log('\n=== PUBLIC KEY (base64 — for anti-crack.ts VENDOR_PUBLIC_KEY) ===');
console.log(publicKeyBase64);

console.log('\n=== INSTRUCTIONS ===');
console.log('1. Copy the private key (including -----BEGIN/END-----) to your .env:');
console.log('   VENDOR_ED25519_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n   ...\n   -----END PRIVATE KEY-----"');
console.log('');
console.log('2. Copy the public key (PEM format) to your .env:');
console.log('   VENDOR_ED25519_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n   ...\n   -----END PUBLIC KEY-----"');
console.log('');
console.log('3. Replace the VENDOR_PUBLIC_KEY constant in:');
console.log('   src/lib/billing/anti-crack.ts');
console.log('   with the base64 public key above.');
console.log('');
console.log('4. NEVER commit the private key to git.');
console.log('5. Back up the private key in a password manager or HSM.');
