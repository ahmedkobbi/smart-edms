/**
 * Smart EDMS Desktop — Heartbeat (phone home to vendor server)
 *
 * Sends a status report to the vendor server every 24 hours.
 * The vendor server can remotely revoke the license by returning action=lock.
 *
 * If the on-prem server is air-gapped (no internet), heartbeats are skipped.
 * The offline license verification (Ed25519 public key) still works.
 */

import { app } from 'electron';
import log from 'electron-log';
import { getLicenseKey } from '../crypto/keychain';
import { query } from '../db/database';

const VENDOR_HEARTBEAT_URL = process.env.VENDOR_SERVER_URL
  ? `${process.env.VENDOR_SERVER_URL}/api/heartbeat`
  : 'https://vendor.smartedms.local/api/heartbeat';

interface HeartbeatResponse {
  action: 'none' | 'read_only' | 'lock';
  status: string;
  reason?: string;
  expiresAt?: string;
  gracePeriodEndsAt?: string;
}

/**
 * Send a heartbeat to the vendor server.
 */
export async function sendHeartbeat(licenseKey: string): Promise<HeartbeatResponse | null> {
  // Gather system stats (opt-in telemetry)
  const stats = await gatherStats();

  const payload = {
    licenseKey,
    version: app.getVersion(),
    activeUsers: stats.activeUsers,
    documentCount: stats.documentCount,
    storageUsed: stats.storageUsed,
    licenseStatus: stats.licenseStatus,
    clockRollbackDetected: stats.clockRollbackDetected,
    integrityValid: stats.integrityValid,
  };

  try {
    const response = await fetch(VENDOR_HEARTBEAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      log.warn(`Heartbeat failed: HTTP ${response.status}`);
      return null;
    }

    const result: HeartbeatResponse = await response.json();

    // Handle the vendor's response
    if (result.action === 'lock') {
      log.error('Vendor server requested LOCK:', result.reason);
      // Lock the application — the main process will show the locked screen
      handleLockAction(result);
    } else if (result.action === 'read_only') {
      log.warn('Vendor server requested READ-ONLY mode');
      handleReadOnlyAction(result);
    } else {
      log.info('Heartbeat OK — license is active');
    }

    return result;
  } catch (err: any) {
    // Network error — probably air-gapped or vendor server is down
    log.warn('Heartbeat failed (network error):', err.message);
    return null;
  }
}

/**
 * Gather system stats for the heartbeat.
 */
async function gatherStats() {
  let activeUsers = 0;
  let documentCount = 0;
  let storageUsed = '0';
  let licenseStatus = 'active';
  let clockRollbackDetected = false;
  let integrityValid = true;

  try {
    const userCount = await query(`SELECT count(*) as count FROM users WHERE status = 'active'`);
    activeUsers = parseInt(userCount?.[0]?.count || '0');

    const docCount = await query(`SELECT count(*) as count FROM documents WHERE deleted_at IS NULL`);
    documentCount = parseInt(docCount?.[0]?.count || '0');

    const storage = await query(`SELECT coalesce(sum(size_bytes), 0) as total FROM document_versions`);
    storageUsed = storage?.[0]?.total || '0';

    const license = await query(`SELECT status, clock_rollback_detected FROM license LIMIT 1`);
    if (license?.[0]) {
      licenseStatus = license[0].status;
      clockRollbackDetected = license[0].clock_rollback_detected;
    }
  } catch {
    // Tables may not exist on first run
  }

  return { activeUsers, documentCount, storageUsed, licenseStatus, clockRollbackDetected, integrityValid };
}

/**
 * Handle lock action from vendor server.
 */
function handleLockAction(response: HeartbeatResponse) {
  // Update the license status in the database
  query(`UPDATE license SET status = 'locked', locked_at = NOW() WHERE 1=1`).catch(() => {});

  // Show a dialog and quit (or show locked screen)
  const { dialog } = require('electron');
  dialog.showErrorBox(
    'License Locked',
    response.reason || 'Your license has been locked by the vendor. Please contact support.'
  );
}

/**
 * Handle read-only action from vendor server.
 */
function handleReadOnlyAction(response: HeartbeatResponse) {
  query(`UPDATE license SET status = 'grace_period' WHERE 1=1`).catch(() => {});
  log.warn('Application entered read-only mode:', response.reason);
}
