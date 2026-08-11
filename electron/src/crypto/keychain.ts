/**
 * Smart EDMS Desktop — OS Keychain Integration
 */
import keytar from 'keytar';
import { randomBytes } from 'crypto';
import log from 'electron-log';

const SERVICE_NAME = 'SmartEDMS';
const KEYS = { KEK: 'kek', JWT_SECRET: 'jwt-secret', LICENSE_KEY: 'license-key', DB_ENCRYPTION_KEY: 'db-key' } as const;
let cachedKeys: Record<string, string> = {};

export async function initializeKeychain(): Promise<void> {
  let kek = await keytar.getPassword(SERVICE_NAME, KEYS.KEK);
  if (!kek) { kek = randomBytes(32).toString('hex'); await keytar.setPassword(SERVICE_NAME, KEYS.KEK, kek); log.info('Created new KEK'); }
  cachedKeys[KEYS.KEK] = kek;

  let jwtSecret = await keytar.getPassword(SERVICE_NAME, KEYS.JWT_SECRET);
  if (!jwtSecret) { jwtSecret = randomBytes(32).toString('base64'); await keytar.setPassword(SERVICE_NAME, KEYS.JWT_SECRET, jwtSecret); log.info('Created new JWT secret'); }
  cachedKeys[KEYS.JWT_SECRET] = jwtSecret;

  let dbKey = await keytar.getPassword(SERVICE_NAME, KEYS.DB_ENCRYPTION_KEY);
  if (!dbKey) { dbKey = randomBytes(32).toString('hex'); await keytar.setPassword(SERVICE_NAME, KEYS.DB_ENCRYPTION_KEY, dbKey); log.info('Created new DB key'); }
  cachedKeys[KEYS.DB_ENCRYPTION_KEY] = dbKey;

  const licenseKey = await keytar.getPassword(SERVICE_NAME, KEYS.LICENSE_KEY);
  if (licenseKey) { cachedKeys[KEYS.LICENSE_KEY] = licenseKey; log.info('License key found'); }
  else { log.info('No license key — first-run mode'); }
}

export function getKek(): string { const k = cachedKeys[KEYS.KEK]; if (!k) throw new Error('KEK not initialized'); return k; }
export function getJwtSecret(): string { const s = cachedKeys[KEYS.JWT_SECRET]; if (!s) throw new Error('JWT not initialized'); return s; }
export function getDbEncryptionKey(): string { const k = cachedKeys[KEYS.DB_ENCRYPTION_KEY]; if (!k) throw new Error('DB key not initialized'); return k; }
export async function getLicenseKey(): Promise<string | null> { if (cachedKeys[KEYS.LICENSE_KEY]) return cachedKeys[KEYS.LICENSE_KEY]; const k = await keytar.getPassword(SERVICE_NAME, KEYS.LICENSE_KEY); if (k) cachedKeys[KEYS.LICENSE_KEY] = k; return k || null; }
export async function setLicenseKey(key: string): Promise<void> { await keytar.setPassword(SERVICE_NAME, KEYS.LICENSE_KEY, key); cachedKeys[KEYS.LICENSE_KEY] = key; log.info('License key stored'); }
export async function deleteLicenseKey(): Promise<void> { await keytar.deletePassword(SERVICE_NAME, KEYS.LICENSE_KEY); delete cachedKeys[KEYS.LICENSE_KEY]; log.info('License key deleted'); }
