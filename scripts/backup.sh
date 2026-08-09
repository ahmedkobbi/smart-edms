#!/usr/bin/env bash
# Smart EDMS — Backup script
#
# Creates a consistent backup of:
#   - SQLite database file (or pg_dump for PostgreSQL)
#   - Local file storage directory
#   - KEK file (if present, for restore on same infra)
#
# Usage:
#   ./scripts/backup.sh [output_dir]
#
# Output: a timestamped tar.gz in the output directory.

set -euo pipefail

OUTPUT_DIR="${1:-/home/z/my-project/backups}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_NAME="smart-edms-backup-${TIMESTAMP}"
BACKUP_DIR="${OUTPUT_DIR}/${BACKUP_NAME}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u)] Starting Smart EDMS backup → ${BACKUP_DIR}"

# 1. Database
DB_URL="${DATABASE_URL:-file:/home/z/my-project/db/custom.db}"
if [[ "${DB_URL}" == file:* ]]; then
  DB_PATH="${DB_URL#file:}"
  if [[ -f "${DB_PATH}" ]]; then
    echo "  → Copying SQLite database: ${DB_PATH}"
    # Use VACUUM INTO for a consistent snapshot
    sqlite3 "${DB_PATH}" "VACUUM INTO '${BACKUP_DIR}/database.db'" 2>/dev/null || cp "${DB_PATH}" "${BACKUP_DIR}/database.db"
  else
    echo "  ⚠  SQLite database not found at ${DB_PATH}"
  fi
elif [[ "${DB_URL}" == postgresql://* ]] || [[ "${DB_URL}" == postgres://* ]]; then
  echo "  → Dumping PostgreSQL database…"
  PGPASSWORD="${DB_PASSWORD:-}" pg_dump "${DB_URL}" --no-owner --clean --if-exists > "${BACKUP_DIR}/database.sql"
else
  echo "  ⚠  Unsupported DATABASE_URL scheme; skipping DB backup"
fi

# 2. Storage (local FS adapter only)
STORAGE_ROOT="${STORAGE_LOCAL_ROOT:-/home/z/my-project/storage}"
if [[ -d "${STORAGE_ROOT}" ]]; then
  echo "  → Archiving storage: ${STORAGE_ROOT}"
  tar -C "$(dirname "${STORAGE_ROOT}")" -czf "${BACKUP_DIR}/storage.tar.gz" "$(basename "${STORAGE_ROOT}")"
else
  echo "  ℹ  No local storage directory; skipping (S3 backups handled separately)"
fi

# 3. KEK (dev-only fallback key)
KEK_PATH="/home/z/my-project/.kek"
if [[ -f "${KEK_PATH}" ]]; then
  echo "  → Copying KEK file"
  cp "${KEK_PATH}" "${BACKUP_DIR}/.kek"
  chmod 600 "${BACKUP_DIR}/.kek"
fi

# 4. Schema snapshot (for version compatibility)
cp /home/z/my-project/prisma/schema.prisma "${BACKUP_DIR}/schema.prisma"

# 5. Manifest
cat > "${BACKUP_DIR}/MANIFEST.json" << EOF
{
  "backupName": "${BACKUP_NAME}",
  "timestamp": "${TIMESTAMP}",
  "smartEdmsVersion": "1.0.0",
  "contents": {
    "database": "database.db (SQLite) or database.sql (PostgreSQL)",
    "storage": "storage.tar.gz (local FS adapter only)",
    "kek": "present if dev fallback KEK was used",
    "schema": "schema.prisma snapshot"
  },
  "restoreInstructions": "See scripts/restore.sh"
}
EOF

# Compress
echo "  → Compressing…"
tar -C "${OUTPUT_DIR}" -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${BACKUP_DIR}"

echo "[$(date -u)] ✓ Backup complete: ${OUTPUT_DIR}/${BACKUP_NAME}.tar.gz"
echo "  Verify integrity: tar -tzf ${OUTPUT_DIR}/${BACKUP_NAME}.tar.gz | head"
echo "  Restore with: ./scripts/restore.sh ${OUTPUT_DIR}/${BACKUP_NAME}.tar.gz"
