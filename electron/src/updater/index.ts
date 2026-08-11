/**
 * Smart EDMS Desktop — Auto-Updater
 *
 * Checks the vendor server for updates and installs them.
 * Uses electron-updater with code signature verification.
 * Only signed updates from the vendor are accepted.
 */

import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Verify code signature on updates (Windows)
autoUpdater.verifyUpdateCodeSignature = true;

let updateAvailable = false;
let updateDownloaded = false;

/**
 * Check for updates from the vendor server.
 */
export async function checkForUpdates(): Promise<{ available: boolean; version?: string }> {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      updateAvailable = true;
      log.info(`Update available: ${result.updateInfo.version}`);
      return { available: true, version: result.updateInfo.version };
    }
    return { available: false };
  } catch (err: any) {
    log.warn('Update check failed:', err.message);
    return { available: false };
  }
}

/**
 * Install a downloaded update (restarts the app).
 */
export async function installUpdate(): Promise<void> {
  if (!updateDownloaded) {
    log.warn('No downloaded update to install');
    return;
  }
  autoUpdater.quitAndInstall();
}

// Events
autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info.version);
  updateAvailable = true;
});

autoUpdater.on('update-not-available', () => {
  log.info('No updates available');
});

autoUpdater.on('download-progress', (progress) => {
  log.info(`Download progress: ${progress.percent.toFixed(1)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded:', info.version);
  updateDownloaded = true;
});

autoUpdater.on('error', (err) => {
  log.error('Update error:', err.message);
});
