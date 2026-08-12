/**
 * Smart EDMS — Unified Access Gate
 *
 * Enforces subscription (SaaS) and license (on-premise) lifecycle on every
 * API request. Called from createApiHandler after authentication.
 *
 * Two deployment modes:
 *
 * SaaS (cloud):
 *   Subscription-based. When currentPeriodEnd passes:
 *     1. 3-day grace period (read-only banner, writes blocked)
 *     2. 7 days: suspended (read-only, all writes blocked)
 *     3. 30 days: locked (login blocked, platform admin can reactivate)
 *     4. 90 days: data export window (tenant can export, then data deleted)
 *
 * On-Premise (LAN):
 *   License-based (HMAC-signed). When expiresAt passes:
 *     1. Configurable grace period (default 30 days, read-only banner)
 *     2. Locked (login blocked, but data is NEVER deleted — it's their server)
 *     3. License can be renewed by uploading a new license file
 *
 * The mode is determined by the DEPLOYMENT_MODE env var:
 *   'saas' (default) — subscription-based
 *   'onprem'          — license-based
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { createHmac, timingSafeEqual } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export type DeploymentMode = 'saas' | 'onprem';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'suspended' | 'locked';
export type LicenseStatus = 'active' | 'grace_period' | 'expired' | 'locked' | 'revoked';
export type AccessLevel = 'full' | 'read_only' | 'locked';

export interface AccessCheckResult {
  allowed: boolean;
  level: AccessLevel;
  mode: DeploymentMode;
  status: string;
  message?: string;
  gracePeriodEndsAt?: Date;
  dataExportDeadline?: Date;
  plan?: string;
  seats?: number;
  storageBytes?: bigint;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// SaaS lifecycle windows (in days)
const SAAS_GRACE_PERIOD_DAYS = 3;       // read-only banner, writes blocked
const SAAS_SUSPEND_AFTER_DAYS = 7;      // fully read-only
const SAAS_LOCK_AFTER_DAYS = 30;        // login blocked
const SAAS_DATA_DELETION_AFTER_DAYS = 90; // data deleted

// On-premise defaults (license can override grace period)
const ONPREM_DEFAULT_GRACE_PERIOD_DAYS = 30;

export function getDeploymentMode(): DeploymentMode {
  return (process.env.DEPLOYMENT_MODE || 'saas').toLowerCase() === 'onprem' ? 'onprem' : 'saas';
}

// ============================================================================
// SaaS SUBSCRIPTION CHECK
// ============================================================================

export async function checkSubscriptionAccess(tenantId: string): Promise<AccessCheckResult> {
  const sub = await db.subscription.findUnique({
    where: { tenantId },
  });

  // No subscription record = trial mode (full access, but limited)
  if (!sub) {
    return {
      allowed: true,
      level: 'full',
      mode: 'saas',
      status: 'trialing',
      plan: 'trial',
      seats: 5,
      storageBytes: BigInt(5 * 1024 * 1024 * 1024),
    };
  }

  // Active subscription — check if currentPeriodEnd has passed
  if (sub.status === 'active' || sub.status === 'trialing') {
    if (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) {
      // Period has ended — transition to past_due
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'past_due',
          gracePeriodEndsAt: new Date(Date.now() + SAAS_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      return {
        allowed: true,
        level: 'read_only',
        mode: 'saas',
        status: 'past_due',
        message: 'Your subscription has expired. You have a 3-day grace period to renew before write access is suspended.',
        gracePeriodEndsAt: new Date(Date.now() + SAAS_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
        plan: sub.plan,
        seats: sub.seats,
        storageBytes: sub.storageBytes,
      };
    }

    return {
      allowed: true,
      level: 'full',
      mode: 'saas',
      status: sub.status,
      plan: sub.plan,
      seats: sub.seats,
      storageBytes: sub.storageBytes,
    };
  }

  // Past due — check grace period
  if (sub.status === 'past_due') {
    const graceEnds = sub.gracePeriodEndsAt || new Date(0);
    const now = new Date();

    if (now < graceEnds) {
      // Still in grace period — read-only
      return {
        allowed: true,
        level: 'read_only',
        mode: 'saas',
        status: 'past_due',
        message: `Subscription expired. Read-only mode. Grace period ends ${graceEnds.toLocaleDateString()}.`,
        gracePeriodEndsAt: graceEnds,
        plan: sub.plan,
        seats: sub.seats,
        storageBytes: sub.storageBytes,
      };
    }

    // Grace period over — check if should suspend (7 days)
    const suspendDate = new Date(graceEnds.getTime() + (SAAS_SUSPEND_AFTER_DAYS - SAAS_GRACE_PERIOD_DAYS) * 24 * 60 * 60 * 1000);
    if (now < suspendDate && !sub.suspendedAt) {
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'suspended',
          suspendedAt: now,
        },
      });

      return {
        allowed: true,
        level: 'read_only',
        mode: 'saas',
        status: 'suspended',
        message: 'Subscription suspended. All write operations are blocked. Renew to restore full access.',
        plan: sub.plan,
        seats: sub.seats,
        storageBytes: sub.storageBytes,
      };
    }

    // Suspended — check if should lock (30 days after expiry)
    const lockDate = new Date(graceEnds.getTime() + (SAAS_LOCK_AFTER_DAYS - SAAS_GRACE_PERIOD_DAYS) * 24 * 60 * 60 * 1000);
    if (now < lockDate) {
      return {
        allowed: true,
        level: 'read_only',
        mode: 'saas',
        status: 'suspended',
        message: 'Subscription suspended. All write operations are blocked.',
        plan: sub.plan,
        seats: sub.seats,
        storageBytes: sub.storageBytes,
      };
    }

    // Lock period — check if should fully lock (30 days)
    if (!sub.lockedAt) {
      const dataExportDeadline = new Date(now.getTime() + SAAS_DATA_DELETION_AFTER_DAYS * 24 * 60 * 60 * 1000);
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'locked',
          lockedAt: now,
          dataExportDeadline,
        },
      });

      return {
        allowed: false,
        level: 'locked',
        mode: 'saas',
        status: 'locked',
        message: `Subscription locked. Data will be deleted on ${dataExportDeadline.toLocaleDateString()}. Contact support immediately.`,
        dataExportDeadline,
        plan: sub.plan,
        seats: sub.seats,
        storageBytes: sub.storageBytes,
      };
    }

    // Fully locked
    return {
      allowed: false,
      level: 'locked',
      mode: 'saas',
      status: 'locked',
      message: `Subscription locked. ${sub.dataExportDeadline ? `Data deletion scheduled for ${sub.dataExportDeadline.toLocaleDateString()}.` : 'Contact support.'}`,
      dataExportDeadline: sub.dataExportDeadline || undefined,
      plan: sub.plan,
      seats: sub.seats,
      storageBytes: sub.storageBytes,
    };
  }

  // Canceled — same as locked
  if (sub.status === 'canceled') {
    return {
      allowed: false,
      level: 'locked',
      mode: 'saas',
      status: 'canceled',
      message: 'Subscription canceled. Contact support to reactivate.',
      plan: sub.plan,
      seats: sub.seats,
      storageBytes: sub.storageBytes,
    };
  }

  // Suspended or locked — return the stored status
  if (sub.status === 'suspended') {
    return {
      allowed: true,
      level: 'read_only',
      mode: 'saas',
      status: 'suspended',
      message: 'Subscription suspended. All write operations are blocked.',
      plan: sub.plan,
      seats: sub.seats,
      storageBytes: sub.storageBytes,
    };
  }

  if (sub.status === 'locked') {
    return {
      allowed: false,
      level: 'locked',
      mode: 'saas',
      status: 'locked',
      message: sub.dataExportDeadline
        ? `Subscription locked. Data deletion scheduled for ${sub.dataExportDeadline.toLocaleDateString()}.`
        : 'Subscription locked. Contact support.',
      dataExportDeadline: sub.dataExportDeadline || undefined,
      plan: sub.plan,
      seats: sub.seats,
      storageBytes: sub.storageBytes,
    };
  }

  // Default — shouldn't reach here
  return {
    allowed: true,
    level: 'full',
    mode: 'saas',
    status: sub.status,
    plan: sub.plan,
    seats: sub.seats,
    storageBytes: sub.storageBytes,
  };
}

// ============================================================================
// On-Premise License Check
// ============================================================================

export async function checkLicenseAccess(tenantId: string): Promise<AccessCheckResult> {
  const license = await db.license.findUnique({
    where: { tenantId },
  });

  // No license = not activated yet (allow first-run setup)
  if (!license) {
    return {
      allowed: true,
      level: 'full',
      mode: 'onprem',
      status: 'no_license',
      message: 'No license installed. Upload a license file to activate.',
    };
  }

  // --- CLOCK ROLLBACK DETECTION ---
  // On-premise customers control the server clock. If they roll it back to
  // before the license expires, we detect it by comparing `now` with the
  // maximum timestamp we've ever seen (`lastCheckedAt`).
  //
  // We allow a small tolerance (5 minutes) to account for minor NTP adjustments
  // and daylight saving time transitions. Anything more than 5 minutes backward
  // is treated as deliberate tampering.
  const now = new Date();
  const CLOCK_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

  if (license.lastCheckedAt) {
    const minAllowed = new Date(license.lastCheckedAt.getTime() - CLOCK_TOLERANCE_MS);
    if (now < minAllowed) {
      // Clock was rolled back — lock immediately
      logger.error('CLOCK ROLLBACK DETECTED', {
        tenantId,
        lastCheckedAt: license.lastCheckedAt,
        currentTime: now,
        rollbackMs: license.lastCheckedAt.getTime() - now.getTime(),
      });

      // Lock the license and flag the tampering
      await db.license.update({
        where: { id: license.id },
        data: {
          status: 'locked',
          lockedAt: now,
          clockRollbackDetected: true,
          // Do NOT update lastCheckedAt — keep the higher value to prevent
          // further rollback attempts below the detected point
        },
      });

      // Record a security audit event
      await recordAuditEvent({
        tenantId,
        eventType: 'security.clock_rollback_detected',
        action: 'update',
        resourceType: 'license',
        resourceId: license.id,
        result: 'deny',
        reason: 'System clock rolled back — license tampering suspected',
        metadata: {
          lastCheckedAt: license.lastCheckedAt.toISOString(),
          detectedAt: now.toISOString(),
          rollbackMs: license.lastCheckedAt.getTime() - now.getTime(),
        },
      });

      return {
        allowed: false,
        level: 'locked',
        mode: 'onprem',
        status: 'locked',
        message: 'License locked: system clock manipulation detected. Contact the vendor to restore access.',
      };
    }
  }

  // Update lastCheckedAt to the maximum of (now, lastCheckedAt)
  // This ensures the "high water mark" only goes forward, never backward
  const newLastCheckedAt = license.lastCheckedAt && license.lastCheckedAt > now
    ? license.lastCheckedAt  // keep the higher value
    : now;                    // advance to current time

  // Only update if the value actually changed (avoid unnecessary DB writes)
  if (!license.lastCheckedAt || newLastCheckedAt > license.lastCheckedAt) {
    await db.license.update({
      where: { id: license.id },
      data: { lastCheckedAt: newLastCheckedAt },
    });
  }

  // If clock rollback was previously detected, stay locked
  if (license.clockRollbackDetected) {
    return {
      allowed: false,
      level: 'locked',
      mode: 'onprem',
      status: 'locked',
      message: 'License locked: system clock manipulation was detected. Contact the vendor with your license ID to restore access.',
    };
  }

  // --- ANTI-CRACK: Database integrity verification ---
  // If the integrity hash doesn't match, someone modified the DB directly
  const { verifyLicenseIntegrity, verifyHardwareFingerprint, detectTampering } = await import('@/lib/billing/anti-crack');

  if (license.integrityHash) {
    const integrityValid = verifyLicenseIntegrity(license, license.integrityHash);
    if (!integrityValid) {
      // Database tampering detected — lock immediately
      logger.error('DATABASE TAMPERING DETECTED', {
        tenantId,
        licenseId: license.id,
      });

      await db.license.update({
        where: { id: license.id },
        data: { status: 'locked', lockedAt: new Date() },
      });

      await recordAuditEvent({
        tenantId,
        eventType: 'security.license_db_tampering',
        action: 'update',
        resourceType: 'license',
        resourceId: license.id,
        result: 'deny',
        reason: 'Database integrity check failed — license record was modified directly',
        metadata: { detectedAt: new Date().toISOString() },
      });

      return {
        allowed: false,
        level: 'locked',
        mode: 'onprem',
        status: 'locked',
        message: 'License locked: database integrity violation detected. Contact the vendor immediately.',
      };
    }
  }

  // --- ANTI-CRACK: Hardware fingerprint verification ---
  if (license.hardwareFingerprint) {
    const hardwareValid = verifyHardwareFingerprint(license.hardwareFingerprint);
    if (!hardwareValid) {
      // License is running on different hardware — cloning detected
      logger.error('HARDWARE FINGERPRINT MISMATCH', {
        tenantId,
        licenseId: license.id,
      });

      await db.license.update({
        where: { id: license.id },
        data: { status: 'locked', lockedAt: new Date() },
      });

      await recordAuditEvent({
        tenantId,
        eventType: 'security.license_hardware_mismatch',
        action: 'update',
        resourceType: 'license',
        resourceId: license.id,
        result: 'deny',
        reason: 'Hardware fingerprint mismatch — license may have been cloned to another server',
        metadata: { detectedAt: new Date().toISOString() },
      });

      return {
        allowed: false,
        level: 'locked',
        mode: 'onprem',
        status: 'locked',
        message: 'License locked: this license is bound to different hardware. Contact the vendor to transfer the license.',
      };
    }
  }

  // Revoked license — immediate lock
  if (license.status === 'revoked') {
    return {
      allowed: false,
      level: 'locked',
      mode: 'onprem',
      status: 'revoked',
      message: 'License has been revoked by the vendor. Contact support.',
    };
  }

  // Active license — check expiry (now was already set above for clock rollback)
  if (license.status === 'active') {
    if (now > license.expiresAt) {
      // License expired — enter grace period
      const graceEnds = new Date(license.expiresAt.getTime() + license.gracePeriodDays * 24 * 60 * 60 * 1000);
      await db.license.update({
        where: { id: license.id },
        data: {
          status: 'grace_period',
          gracePeriodEndsAt: graceEnds,
        },
      });

      return {
        allowed: true,
        level: 'read_only',
        mode: 'onprem',
        status: 'grace_period',
        message: `License expired on ${license.expiresAt.toLocaleDateString()}. Grace period ends ${graceEnds.toLocaleDateString()}. Upload a renewed license to restore full access.`,
        gracePeriodEndsAt: graceEnds,
        plan: license.plan,
        seats: license.seats,
        storageBytes: license.storageBytes,
      };
    }

    return {
      allowed: true,
      level: 'full',
      mode: 'onprem',
      status: 'active',
      plan: license.plan,
      seats: license.seats,
      storageBytes: license.storageBytes,
    };
  }

  // Grace period — check if should lock
  if (license.status === 'grace_period') {
    const graceEnds = license.gracePeriodEndsAt || new Date(0);

    if (now < graceEnds) {
      return {
        allowed: true,
        level: 'read_only',
        mode: 'onprem',
        status: 'grace_period',
        message: `License expired. Read-only mode. Grace period ends ${graceEnds.toLocaleDateString()}.`,
        gracePeriodEndsAt: graceEnds,
        plan: license.plan,
        seats: license.seats,
        storageBytes: license.storageBytes,
      };
    }

    // Grace period over — lock
    if (!license.lockedAt) {
      await db.license.update({
        where: { id: license.id },
        data: {
          status: 'locked',
          lockedAt: now,
        },
      });
    }

    return {
      allowed: false,
      level: 'locked',
      mode: 'onprem',
      status: 'locked',
      message: 'License expired and grace period ended. Upload a renewed license to restore access. Your data is preserved.',
      plan: license.plan,
      seats: license.seats,
      storageBytes: license.storageBytes,
    };
  }

  // Locked
  if (license.status === 'locked') {
    return {
      allowed: false,
      level: 'locked',
      mode: 'onprem',
      status: 'locked',
      message: 'License locked. Upload a renewed license to restore access. Your data is preserved.',
      plan: license.plan,
      seats: license.seats,
      storageBytes: license.storageBytes,
    };
  }

  // Expired (legacy status — treat as grace period)
  if (license.status === 'expired') {
    return {
      allowed: true,
      level: 'read_only',
      mode: 'onprem',
      status: 'grace_period',
      message: 'License expired. Upload a renewed license to restore access.',
      plan: license.plan,
      seats: license.seats,
      storageBytes: license.storageBytes,
    };
  }

  return {
    allowed: true,
    level: 'full',
    mode: 'onprem',
    status: license.status,
    plan: license.plan,
    seats: license.seats,
    storageBytes: license.storageBytes,
  };
}

// ============================================================================
// UNIFIED ACCESS CHECK (called from createApiHandler)
// ============================================================================

export async function checkAccess(tenantId: string): Promise<AccessCheckResult> {
  const mode = getDeploymentMode();
  return mode === 'onprem' ? checkLicenseAccess(tenantId) : checkSubscriptionAccess(tenantId);
}

/**
 * Check if a write operation should be blocked.
 * Returns true if the operation is allowed, false if blocked.
 */
export function isWriteAllowed(result: AccessCheckResult, method: string): boolean {
  if (result.level === 'locked') return false;
  if (result.level === 'read_only') {
    // Allow GET/HEAD/OPTIONS (read operations)
    // Block POST/PUT/PATCH/DELETE (write operations)
    return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  }
  return true; // full access
}

// ============================================================================
// LICENSE SIGNING & VERIFICATION
// ============================================================================

const LICENSE_SIGNING_SECRET = process.env.LICENSE_SIGNING_SECRET || 'smart-edms-license-signing-key-change-in-production';

export interface LicensePayload {
  tenantId: string;
  tenantName: string;
  plan: string;
  seats: number;
  storageBytes: string; // BigInt serialized as string
  features: string[];
  issuedAt: string;    // ISO date
  expiresAt: string;   // ISO date
  gracePeriodDays: number;
  issuedBy: string;
}

/**
 * Sign a license payload with HMAC-SHA256.
 * The vendor uses this to issue license files.
 */
export function signLicense(payload: LicensePayload): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const signature = createHmac('sha256', LICENSE_SIGNING_SECRET).update(canonical).digest('hex');
  return signature;
}

/**
 * Verify a license signature.
 * Returns true if the signature matches the payload (timing-safe).
 */
export function verifyLicenseSignature(payload: LicensePayload, signature: string): boolean {
  const expected = signLicense(payload);
  try {
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Generate a complete license key (base64-encoded JSON with payload + signature).
 * The vendor runs this to create a .license file for the customer.
 */
export function generateLicenseKey(payload: LicensePayload): string {
  const signature = signLicense(payload);
  const licenseObject = { ...payload, signature };
  return Buffer.from(JSON.stringify(licenseObject)).toString('base64');
}

/**
 * Parse and verify a license key string.
 * Returns the payload if valid, throws if the signature is invalid.
 */
export function parseLicenseKey(licenseKey: string): LicensePayload & { signature: string } {
  try {
    const decoded = Buffer.from(licenseKey, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);

    // Extract signature
    const { signature, ...payload } = parsed;

    // Verify signature
    if (!verifyLicenseSignature(payload as LicensePayload, signature)) {
      throw new Error('Invalid license signature — license may have been tampered with');
    }

    return { ...payload, signature } as LicensePayload & { signature: string };
  } catch (err) {
    throw new Error(`Failed to parse license: ${(err as Error).message}`);
  }
}

// ============================================================================
// LICENSE INSTALLATION
// ============================================================================

export async function installLicense(licenseKey: string, tenantId: string): Promise<void> {
  // Parse and verify the license
  const parsed = parseLicenseKey(licenseKey);

  // Verify the license is for this tenant
  if (parsed.tenantId !== tenantId) {
    throw new Error(`License is for tenant "${parsed.tenantName}" (${parsed.tenantId}), not this tenant`);
  }

  // Check if the license is already expired
  const expiresAt = new Date(parsed.expiresAt);
  if (expiresAt < new Date()) {
    throw new Error(`License expired on ${expiresAt.toLocaleDateString()}`);
  }

  // --- ANTI-CRACK: Compute hardware fingerprint and bind it to this license ---
  const { computeHardwareFingerprint, computeLicenseIntegrityHash, generateLicenseNonce } = await import('@/lib/billing/anti-crack');
  const fingerprint = computeHardwareFingerprint();
  const nonce = generateLicenseNonce();

  // Build the license record (we need it to compute the integrity hash)
  const licenseRecord = {
    tenantId,
    licenseKey,
    status: 'active',
    licenseeName: parsed.tenantName,
    plan: parsed.plan,
    seats: parsed.seats,
    storageBytes: BigInt(parsed.storageBytes),
    issuedAt: new Date(parsed.issuedAt),
    expiresAt,
    gracePeriodDays: parsed.gracePeriodDays || ONPREM_DEFAULT_GRACE_PERIOD_DAYS,
    signature: parsed.signature,
    clockRollbackDetected: false,
    lastCheckedAt: new Date(),
  };

  const integrityHash = computeLicenseIntegrityHash(licenseRecord);

  // Upsert the license record
  await db.license.upsert({
    where: { tenantId },
    create: {
      ...licenseRecord,
      licenseData: JSON.stringify(parsed),
      storageBytes: BigInt(parsed.storageBytes),
      features: JSON.stringify(parsed.features),
      issuedBy: parsed.issuedBy,
      integrityHash,
      hardwareFingerprint: fingerprint.hash,
      nonce,
    },
    update: {
      ...licenseRecord,
      licenseData: JSON.stringify(parsed),
      storageBytes: BigInt(parsed.storageBytes),
      features: JSON.stringify(parsed.features),
      issuedBy: parsed.issuedBy,
      lockedAt: null,
      gracePeriodEndsAt: null,
      clockRollbackDetected: false,
      lastCheckedAt: new Date(),
      integrityHash,
      hardwareFingerprint: fingerprint.hash,
      nonce,
    },
  });

  logger.info('License installed', { tenantId, licensee: parsed.tenantName, expiresAt });
}

// ============================================================================
// CRON: Process expired subscriptions and licenses
// ============================================================================

export async function processExpiredSubscriptions(): Promise<void> {
  const now = new Date();

  // Find active subscriptions past their period end
  const expired = await db.subscription.findMany({
    where: {
      status: { in: ['active', 'trialing'] },
      currentPeriodEnd: { lt: now },
    },
  });

  for (const sub of expired) {
    const graceEnds = new Date(now.getTime() + SAAS_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    await db.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'past_due',
        gracePeriodEndsAt: graceEnds,
      },
    });

    logger.info('Subscription transitioned to past_due', {
      tenantId: sub.tenantId,
      gracePeriodEndsAt: graceEnds,
    });
  }

  // Find past_due subscriptions past their grace period → suspend
  const pastDueExpired = await db.subscription.findMany({
    where: {
      status: 'past_due',
      gracePeriodEndsAt: { lt: now },
      suspendedAt: null,
    },
  });

  for (const sub of pastDueExpired) {
    await db.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'suspended',
        suspendedAt: now,
      },
    });

    logger.info('Subscription suspended', { tenantId: sub.tenantId });
  }

  // Find suspended subscriptions past 30 days → lock
  const lockDate = new Date(now.getTime() - (SAAS_LOCK_AFTER_DAYS - SAAS_SUSPEND_AFTER_DAYS) * 24 * 60 * 60 * 1000);
  const toLock = await db.subscription.findMany({
    where: {
      status: 'suspended',
      suspendedAt: { lt: lockDate },
      lockedAt: null,
    },
  });

  for (const sub of toLock) {
    const dataExportDeadline = new Date(now.getTime() + SAAS_DATA_DELETION_AFTER_DAYS * 24 * 60 * 60 * 1000);
    await db.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'locked',
        lockedAt: now,
        dataExportDeadline,
      },
    });

    logger.warn('Subscription locked', {
      tenantId: sub.tenantId,
      dataExportDeadline,
    });
  }
}

export async function processExpiredLicenses(): Promise<void> {
  const now = new Date();

  // Find active licenses past their expiry
  const expired = await db.license.findMany({
    where: {
      status: 'active',
      expiresAt: { lt: now },
    },
  });

  for (const license of expired) {
    const graceEnds = new Date(license.expiresAt.getTime() + license.gracePeriodDays * 24 * 60 * 60 * 1000);
    await db.license.update({
      where: { id: license.id },
      data: {
        status: 'grace_period',
        gracePeriodEndsAt: graceEnds,
      },
    });

    logger.info('License entered grace period', {
      tenantId: license.tenantId,
      licensee: license.licenseeName,
      gracePeriodEndsAt: graceEnds,
    });
  }

  // Find grace_period licenses past their grace period → lock
  const graceExpired = await db.license.findMany({
    where: {
      status: 'grace_period',
      gracePeriodEndsAt: { lt: now },
      lockedAt: null,
    },
  });

  for (const license of graceExpired) {
    await db.license.update({
      where: { id: license.id },
      data: {
        status: 'locked',
        lockedAt: now,
      },
    });

    logger.warn('License locked', {
      tenantId: license.tenantId,
      licensee: license.licenseeName,
    });
  }
}
