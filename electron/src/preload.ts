/**
 * Smart EDMS Desktop — Preload Script
 *
 * Runs in an isolated context between the main process (full Node.js access)
 * and the renderer process (Chromium sandbox). Uses contextBridge to expose
 * a LIMITED, SAFE API to the renderer.
 *
 * SECURITY: The renderer can ONLY access the methods exposed here.
 * It cannot use require(), cannot access the filesystem, cannot access
 * the database directly. All operations go through IPC.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('edms', {
  // === Database operations ===
  query: (channel: string, ...args: any[]) => ipcRenderer.invoke(`db:${channel}`, ...args),

  // === License management ===
  getLicenseStatus: () => ipcRenderer.invoke('license:status'),
  installLicense: (licenseKey: string) => ipcRenderer.invoke('license:install', licenseKey),
  getLicenseInfo: () => ipcRenderer.invoke('license:info'),

  // === File operations (document upload/download) ===
  saveFile: (path: string, data: ArrayBuffer) => ipcRenderer.invoke('file:save', path, data),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  deleteFile: (path: string) => ipcRenderer.invoke('file:delete', path),

  // === Crypto operations ===
  encrypt: (data: string) => ipcRenderer.invoke('crypto:encrypt', data),
  decrypt: (data: string) => ipcRenderer.invoke('crypto:decrypt', data),

  // === System info ===
  getVersion: () => ipcRenderer.invoke('system:version'),
  getHardwareFingerprint: () => ipcRenderer.invoke('system:fingerprint'),
  getDataPath: () => ipcRenderer.invoke('system:dataPath'),

  // === Updates ===
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),

  // === Heartbeat ===
  sendHeartbeat: () => ipcRenderer.invoke('heartbeat:send'),

  // === App info ===
  isElectron: true,
  platform: process.platform,
});
