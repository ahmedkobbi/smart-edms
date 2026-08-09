/**
 * Smart EDMS — formatting helpers
 */

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes < 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function truncateHash(hash: string, prefix = 8, suffix = 6): string {
  if (!hash || hash.length <= prefix + suffix) return hash;
  return `${hash.slice(0, prefix)}…${hash.slice(-suffix)}`;
}
