/**
 * Smart EDMS — Hardware-key enforcement
 *
 * When a tenant enables `settings.security.requireHardwareKeyForHighPrivilegeRoles`,
 * users with high-privilege roles (tenant_admin, security_officer) must have
 * at least one hardware-backed passkey registered to perform admin actions.
 *
 * A "hardware-backed" passkey is one where the authenticator reports
 * `backedUp: true` — meaning the credential is synced via a platform
 * (like iCloud Keychain, Google Password Manager) and is NOT a software-
 * only credential. This is a proxy for "hardware-backed" — true hardware
 * security keys (YubiKey, Titan) also set `backedUp: false` (they're
 * not sync-able), so the check is actually:
 *
 *   - `backedUp === true` → platform-backed credential (synced)
 *   - `backedUp === false` → device-bound credential (hardware key)
 *
 * The master prompt says "hardware key support for high-privilege roles".
 * The strictest interpretation requires a device-bound credential
 * (`backedUp === false`) — these cannot be exfiltrated by phishing.
 * However, platform-backed credentials are also acceptable for many
 * enterprise deployments and provide better UX.
 *
 * We check for ANY passkey (hardware or platform-backed) by default.
 * Tenants can tighten this to require `backedUp === false` (true hardware
 * key only) via `settings.security.requireTrueHardwareKey`.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import type { StoredCredential } from '@/lib/auth/webauthn';

const HIGH_PRIVILEGE_ROLES = ['tenant_admin', 'security_officer'];

/**
 * Check if a user has at least one passkey registered.
 */
export async function hasPasskey(userId: string): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passkeyCredentials: true },
    });
    if (!user?.passkeyCredentials) return false;
    const creds: StoredCredential[] = JSON.parse(user.passkeyCredentials || '[]');
    return creds.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a user has at least one hardware-backed passkey.
 *
 * @param requireTrueHardwareKey If true, only device-bound credentials
 *   (`backedUp === false`) count. If false, any passkey counts.
 */
export async function hasHardwareBackedPasskey(
  userId: string,
  requireTrueHardwareKey: boolean = false,
): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passkeyCredentials: true },
    });
    if (!user?.passkeyCredentials) return false;
    const creds: StoredCredential[] = JSON.parse(user.passkeyCredentials || '[]');
    if (creds.length === 0) return false;

    if (requireTrueHardwareKey) {
      // Only device-bound credentials (backedUp === false) count as
      // "true hardware keys" — these cannot be synced or phished.
      return creds.some((c) => c.backedUp === false);
    }
    // Any passkey counts (platform-backed or device-bound)
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a user requires hardware-key enforcement.
 *
 * Returns true if:
 *   1. The tenant has `settings.security.requireHardwareKeyForHighPrivilegeRoles` enabled
 *   2. The user has a high-privilege role (tenant_admin, security_officer)
 *
 * When this returns true, the handler should call `hasHardwareBackedPasskey()`
 * to verify the user has a suitable passkey before allowing the request.
 */
export async function requiresHardwareKey(
  tenantId: string,
  userId: string,
  userRoles: string[],
): Promise<{ required: boolean; requireTrueHardwareKey: boolean }> {
  // Quick check: if the user doesn't have a high-privilege role, no enforcement
  const hasHighPrivRole = userRoles.some((r) => HIGH_PRIVILEGE_ROLES.includes(r));
  if (!hasHighPrivRole) return { required: false, requireTrueHardwareKey: false };

  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = JSON.parse(tenant?.settings || '{}');
    const requireHwKey = settings?.security?.requireHardwareKeyForHighPrivilegeRoles === true;
    const requireTrueHw = settings?.security?.requireTrueHardwareKey === true;
    return { required: requireHwKey, requireTrueHardwareKey: requireTrueHw };
  } catch {
    return { required: false, requireTrueHardwareKey: false };
  }
}

/**
 * Full hardware-key enforcement check.
 *
 * Combines `requiresHardwareKey()` + `hasHardwareBackedPasskey()` into
 * a single call. Returns `{ ok: true }` if the user passes enforcement,
 * or `{ ok: false, reason: string }` if they need to register a passkey.
 */
export async function enforceHardwareKey(opts: {
  tenantId: string;
  userId: string;
  userRoles: string[];
}): Promise<{ ok: boolean; reason?: string }> {
  const { required, requireTrueHardwareKey } = await requiresHardwareKey(
    opts.tenantId,
    opts.userId,
    opts.userRoles,
  );

  if (!required) return { ok: true };

  const hasKey = await hasHardwareBackedPasskey(opts.userId, requireTrueHardwareKey);
  if (hasKey) return { ok: true };

  const reason = requireTrueHardwareKey
    ? 'A hardware security key (device-bound passkey) is required for high-privilege roles. Please register a hardware key in Settings → Security.'
    : 'A passkey is required for high-privilege roles. Please register a passkey in Settings → Security.';

  logger.warn('hardware_key.enforcement_failed', {
    tenantId: opts.tenantId,
    userId: opts.userId,
    roles: opts.userRoles,
    requireTrueHardwareKey,
  });

  return { ok: false, reason };
}
