/**
 * Smart EDMS Desktop — IPC Handlers
 *
 * Registers all IPC channels that the renderer process can invoke.
 * The renderer calls window.edms.query(), window.edms.installLicense(), etc.
 * Each call goes through the secure contextBridge → ipcRenderer → ipcMain.
 *
 * SECURITY: The renderer has NO direct access to:
 * - The filesystem
 * - The database
 * - The keychain
 * - Node.js APIs
 * It can ONLY call the methods registered here.
 */

import { ipcMain, app } from 'electron';
import log from 'electron-log';
import { query, transaction } from '../db/database';
import { verifyLicenseOnStartup, installLicense, computeHardwareFingerprint } from '../license/verify';
import { getLicenseKey, getKek, getJwtSecret } from '../crypto/keychain';
import * as path from 'path';
import * as fs from 'fs';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export function registerIpcHandlers() {
  // === DATABASE OPERATIONS ===
  ipcMain.handle('db:query', async (event, sql: string, params?: any[]) => {
    try {
      return await query(sql, params);
    } catch (err: any) {
      log.error('DB query error:', err.message);
      return { error: err.message };
    }
  });

  ipcMain.handle('db:transaction', async (event, fn: any) => {
    try {
      return await transaction(fn);
    } catch (err: any) {
      log.error('DB transaction error:', err.message);
      return { error: err.message };
    }
  });

  // === LICENSE MANAGEMENT ===
  ipcMain.handle('license:status', async () => {
    return verifyLicenseOnStartup();
  });

  ipcMain.handle('license:install', async (event, licenseKey: string) => {
    return installLicense(licenseKey);
  });

  ipcMain.handle('license:info', async () => {
    const key = await getLicenseKey();
    if (!key) return null;
    // Return parsed license info (without the signature)
    try {
      const decoded = Buffer.from(key, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      const { signature, ...info } = parsed;
      return info;
    } catch {
      return null;
    }
  });

  // === FILE OPERATIONS (document storage) ===
  ipcMain.handle('file:save', async (event, filePath: string, data: ArrayBuffer) => {
    try {
      const fullPath = path.join(app.getPath('userData'), 'storage', filePath);
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.writeFile(fullPath, Buffer.from(data));
      return { ok: true };
    } catch (err: any) {
      log.error('File save error:', err.message);
      return { error: err.message };
    }
  });

  ipcMain.handle('file:read', async (event, filePath: string) => {
    try {
      const fullPath = path.join(app.getPath('userData'), 'storage', filePath);
      const data = await fs.promises.readFile(fullPath);
      return data.buffer;
    } catch (err: any) {
      log.error('File read error:', err.message);
      return { error: err.message };
    }
  });

  ipcMain.handle('file:delete', async (event, filePath: string) => {
    try {
      const fullPath = path.join(app.getPath('userData'), 'storage', filePath);
      await fs.promises.unlink(fullPath);
      return { ok: true };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  // === CRYPTO OPERATIONS ===
  ipcMain.handle('crypto:encrypt', async (event, data: string) => {
    try {
      const kek = getKek();
      const key = Buffer.from(kek, 'hex').slice(0, 32);
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('crypto:decrypt', async (event, data: string) => {
    try {
      const kek = getKek();
      const key = Buffer.from(kek, 'hex').slice(0, 32);
      const buf = Buffer.from(data, 'base64');
      const iv = buf.slice(0, 16);
      const authTag = buf.slice(16, 32);
      const encrypted = buf.slice(32);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (err: any) {
      return { error: err.message };
    }
  });

  // === SYSTEM INFO ===
  ipcMain.handle('system:version', () => app.getVersion());
  ipcMain.handle('system:fingerprint', () => computeHardwareFingerprint());
  ipcMain.handle('system:dataPath', () => app.getPath('userData'));

  // === UPDATES ===
  ipcMain.handle('updates:check', async () => {
    const { checkForUpdates } = require('../updater');
    return checkForUpdates();
  });

  ipcMain.handle('updates:install', async () => {
    const { installUpdate } = require('../updater');
    return installUpdate();
  });

  // === HEARTBEAT ===
  ipcMain.handle('heartbeat:send', async () => {
    const { sendHeartbeat } = require('../license/heartbeat');
    const licenseKey = await getLicenseKey();
    if (!licenseKey) return { error: 'No license' };
    return sendHeartbeat(licenseKey);
  });

  log.info('✅ IPC handlers registered');
}
