import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';

const prisma = new PrismaClient();

const heartbeatSchema = z.object({
  licenseKey: z.string().min(50),
  version: z.string().optional(),
  activeUsers: z.number().optional(),
  documentCount: z.number().optional(),
  storageUsed: z.string().optional(), // BigInt as string
  licenseStatus: z.string(),
  clockRollbackDetected: z.boolean().default(false),
  integrityValid: z.boolean().default(true),
});

/**
 * Heartbeat endpoint — on-prem servers phone home every 24 hours.
 *
 * SECURITY:
 * - The on-prem server sends its license key (which is HMAC/Ed25519 signed)
 * - We verify the license exists in our registry
 * - We check if it's been revoked → return { action: 'lock' }
 * - We store the heartbeat for monitoring
 * - We return the current license status (so the on-prem server stays in sync)
 *
 * If the on-prem server is air-gapped, it doesn't call this endpoint.
 * The offline license verification (Ed25519 public key) still works.
 */
export async function POST(req: NextRequest) {
  const body = heartbeatSchema.parse(await req.json());

  // Find the license by key
  const license = await prisma.license.findUnique({
    where: { licenseKey: body.licenseKey },
    include: { customer: true },
  });

  if (!license) {
    return NextResponse.json({ error: 'license_not_found', action: 'lock' }, { status: 404 });
  }

  // Check if revoked
  if (license.status === 'revoked') {
    // Store the heartbeat (for audit)
    await prisma.heartbeat.create({
      data: {
        licenseId: license.id,
        customerId: license.customerId,
        version: body.version,
        activeUsers: body.activeUsers,
        documentCount: body.documentCount,
        storageUsed: body.storageUsed ? BigInt(body.storageUsed) : null,
        licenseStatus: body.licenseStatus,
        clockRollbackDetected: body.clockRollbackDetected,
        integrityValid: body.integrityValid,
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      },
    });

    // Tell the on-prem server to lock
    return NextResponse.json({
      action: 'lock',
      reason: 'License has been revoked by the vendor',
      revokedAt: license.revokedAt,
    });
  }

  // Check if expired
  const now = new Date();
  const isExpired = now > license.expiresAt;
  const graceEnds = new Date(license.expiresAt.getTime() + license.gracePeriodDays * 24 * 60 * 60 * 1000);
  const inGrace = isExpired && now < graceEnds;
  const shouldLock = isExpired && now >= graceEnds;

  // Store the heartbeat
  await prisma.heartbeat.create({
    data: {
      licenseId: license.id,
      customerId: license.customerId,
      version: body.version,
      activeUsers: body.activeUsers,
      documentCount: body.documentCount,
      storageUsed: body.storageUsed ? BigInt(body.storageUsed) : null,
      licenseStatus: body.licenseStatus,
      clockRollbackDetected: body.clockRollbackDetected,
      integrityValid: body.integrityValid,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
    },
  });

  // Update the license's activation info if not set
  if (!license.activatedAt) {
    await prisma.license.update({
      where: { id: license.id },
      data: { activatedAt: now },
    });
  }

  // Return the current status
  let action = 'none';
  let status = 'active';

  if (shouldLock) {
    action = 'lock';
    status = 'locked';
  } else if (inGrace) {
    action = 'read_only';
    status = 'grace_period';
  } else if (isExpired) {
    action = 'read_only';
    status = 'expired';
  }

  // Flag clock rollback
  if (body.clockRollbackDetected) {
    action = 'lock';
    status = 'locked';
  }

  // Flag integrity failure
  if (!body.integrityValid) {
    action = 'lock';
    status = 'locked';
  }

  // Build the response payload
  const payload = {
    action,
    status,
    licenseId: license.id,
    tenantName: license.tenantName,
    expiresAt: license.expiresAt.toISOString(),
    gracePeriodEndsAt: inGrace ? graceEnds.toISOString() : undefined,
    seats: license.seats,
    storageBytes: license.storageBytes.toString(),
    features: JSON.parse(license.features),
    // Anti-replay: unique nonce + timestamp + TTL
    nonce: require('crypto').randomBytes(16).toString('hex'),
    timestamp: new Date().toISOString(),
    ttl: 300, // response valid for 5 minutes
  };

  // --- SIGN the response with Ed25519 private key ---
  // This prevents local server emulators — they can't forge the signature
  const { signLicense } = require('@/lib/license-signing');
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const { sign } = require('crypto');
  const privateKeyObj = require('crypto').createPrivateKey(process.env.VENDOR_ED25519_PRIVATE_KEY);
  const signature = sign(null, Buffer.from(canonical, 'utf-8'), privateKeyObj).toString('base64');

  return NextResponse.json({
    payload,
    signature,
  });
}

/**
 * GET — returns recent heartbeats for the dashboard.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const hours = parseInt(url.searchParams.get('hours') || '24');
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const heartbeats = await prisma.heartbeat.findMany({
    where: { receivedAt: { gte: since } },
    include: {
      license: { select: { tenantName: true, status: true } },
      customer: { select: { name: true } },
    },
    orderBy: { receivedAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ items: heartbeats, total: heartbeats.length });
}
