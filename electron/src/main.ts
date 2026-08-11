/**
 * Smart EDMS Desktop — Main Process
 *
 * SECURITY HARDENING:
 * - devTools: false (no F12, no Inspector)
 * - nodeIntegration: false (renderer can't access Node.js)
 * - contextIsolation: true (renderer runs in isolated context)
 * - sandbox: true (renderer sandboxed by OS)
 * - webSecurity: true (same-origin policy enforced)
 * - No external navigation allowed
 * - No new windows allowed
 * - Menu bar removed (no Developer Tools menu item)
 *
 * ARCHITECTURE:
 * - Main process handles: DB, crypto, license verification, file I/O
 * - Renderer process: Next.js static export (Mantine UI, all pages)
 * - Communication: ipcMain ↔ ipcRenderer via secure contextBridge
 */

import { app, BrowserWindow, Menu, shell, ipcMain, session } from 'electron';
import * as path from 'path';
import { initializeDatabase } from './db/database';
import { verifyLicenseOnStartup } from './license/verify';
import { initializeKeychain } from './crypto/keychain';
import { registerIpcHandlers } from './ipc/handlers';
import { checkForUpdates } from './updater';
import log from 'electron-log';

// ============================================================================
// LOGGING
// ============================================================================

log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB max per log file
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// ============================================================================
// SECURITY: Single instance lock
// ============================================================================

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log.warn('Another instance is already running. Quitting.');
  app.quit();
}

// ============================================================================
// GLOBALS
// ============================================================================

let mainWindow: BrowserWindow | null = null;
let isInitialized = false;

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(async () => {
  log.info('Smart EDMS Desktop starting...');

  // --- 1. Initialize OS keychain (retrieve or create KEK, JWT secret) ---
  try {
    await initializeKeychain();
    log.info('✅ Keychain initialized');
  } catch (err) {
    log.error('❌ Keychain initialization failed:', err);
    showErrorDialog('Security Error', 'Failed to initialize OS keychain. The application cannot start without secure key storage.');
    app.quit();
    return;
  }

  // --- 2. Initialize database (PGlite or SQLite with encryption) ---
  try {
    await initializeDatabase();
    log.info('✅ Database initialized');
  } catch (err) {
    log.error('❌ Database initialization failed:', err);
    showErrorDialog('Database Error', 'Failed to initialize the encrypted database. Check disk space and permissions.');
    app.quit();
    return;
  }

  // --- 3. Verify license (Ed25519 public key verification) ---
  try {
    const licenseStatus = await verifyLicenseOnStartup();
    log.info('✅ License verified:', licenseStatus);

    if (licenseStatus.status === 'locked') {
      // License is locked — show the locked screen only
      createWindow(true);
      return;
    }
  } catch (err) {
    log.error('❌ License verification failed:', err);
    // Allow first-run without a license (user needs to upload one)
  }

  // --- 4. Create the main window ---
  createWindow(false);

  // --- 5. Check for updates (non-blocking) ---
  setTimeout(() => {
    checkForUpdates().catch((err) => {
      log.warn('Update check failed:', err.message);
    });
  }, 5000);

  // --- 6. Start heartbeat timer (phone home to vendor server every 24h) ---
  startHeartbeatTimer();

  isInitialized = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && isInitialized) {
    createWindow(false);
  }
});

// ============================================================================
// SECURITY: Prevent navigation to external URLs
// ============================================================================

app.on('web-contents-created', (event, contents) => {
  // Block all navigation to external URLs
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
      log.warn('Blocked navigation to external URL:', navigationUrl);
    }
  });

  // Block all new windows
  contents.setWindowOpenHandler(({ url }) => {
    log.warn('Blocked new window:', url);
    // Open external links in the default browser instead
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Block all webview tags
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
  });
});

// ============================================================================
// WINDOW CREATION
// ============================================================================

function createWindow(locked: boolean) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false, // Show only when ready (prevents white flash)
    title: 'Smart EDMS',
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      // === SECURITY HARDENING ===
      devTools: process.env.NODE_ENV === 'development', // ❌ No DevTools in production
      nodeIntegration: false,           // ❌ No Node.js in renderer
      contextIsolation: true,           // ✅ Isolated context
      sandbox: true,                    // ✅ OS sandbox
      webSecurity: true,                // ✅ Same-origin policy
      allowRunningInsecureContent: false, // ❌ No mixed content
      experimentalFeatures: false,      // ❌ No experimental features
      webviewTag: false,                // ❌ No webview tags
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Remove the application menu entirely (no "View → Developer Tools")
  Menu.setApplicationMenu(null);

  // Load the Next.js static export
  const rendererPath = path.join(__dirname, '..', 'renderer', 'index.html');

  if (locked) {
    // Load a locked screen
    mainWindow.loadFile(path.join(__dirname, '..', 'resources', 'locked.html'));
  } else {
    mainWindow.loadFile(rendererPath);
  }

  // Show window only when ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Register IPC handlers (only once)
  if (!isInitialized) {
    registerIpcHandlers();
  }
}

// ============================================================================
// ERROR DIALOG
// ============================================================================

function showErrorDialog(title: string, message: string) {
  const { dialog } = require('electron');
  dialog.showErrorBox(title, message);
}

// ============================================================================
// HEARTBEAT TIMER (phone home to vendor server every 24h)
// ============================================================================

async function startHeartbeatTimer() {
  const HEARTBEAT_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  const { sendHeartbeat } = require('./license/heartbeat');
  const { getLicenseKey } = require('./crypto/keychain');

  // Send initial heartbeat after 30 seconds
  setTimeout(async () => {
    try {
      const licenseKey = await getLicenseKey();
      if (licenseKey) {
        await sendHeartbeat(licenseKey);
        log.info('Initial heartbeat sent');
      }
    } catch (err) {
      log.warn('Initial heartbeat failed:', err);
    }
  }, 30_000);

  // Schedule recurring heartbeat
  setInterval(async () => {
    try {
      const licenseKey = await getLicenseKey();
      if (licenseKey) {
        await sendHeartbeat(licenseKey);
        log.info('Heartbeat sent');
      }
    } catch (err) {
      log.warn('Heartbeat failed:', err);
    }
  }, HEARTBEAT_INTERVAL);
}

// ============================================================================
// SECURITY: Prevent certificate errors (only allow vendor server)
// ============================================================================

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Only allow the vendor server's certificate (pin in production)
  const vendorUrl = process.env.VENDOR_SERVER_URL || 'https://vendor.smartedms.local';
  if (url.startsWith(vendorUrl)) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
