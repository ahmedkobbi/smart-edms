#!/usr/bin/env bash
# Smart EDMS — Restore script
#
# Restores a backup created by scripts/backup.sh.
#
# Usage:
#   ./scripts/restore.sh <backup.tar.gz> [--confirm]
#
# WARNING: This OVERWRITES the current database and storage.
# Pass --confirm to skip the confirmation prompt.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup.tar.gz> [--confirm]"
  exit 1
fi

BACKUP_TAR="$1"
CONFIRM="${2:-}"

if [[ ! -f "${BACKUP_TAR}" ]]; then
  echo "Error: backup file not found: ${BACKUP_TAR}"
  exit 1
fi

if [[ "${CONFIRM}" != "--confirm" ]]; then
  echo "⚠️  This will OVERWRITE the current database and storage."
  echo "    Backup file: ${BACKUP_TAR}"
  echo "    To proceed, re-run with --confirm"
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap "rm -rf ${TMP_DIR}" EXIT

echo "[$(date -u)] Extracting backup…"
tar -xzf "${BACKUP_TAR}" -C "${TMP_DIR}"
BACKUP_DIR=$(ls -d "${TMP_DIR}"/*/)

# 1. Database
DB_URL="${DATABASE_URL:-file:/home/z/my-project/db/custom.db}"
if [[ "${DB_URL}" == file:* ]]; then
  DB_PATH="${DB_URL#file:}"
  if [[ -f "${BACKUP_DIR}database.db" ]]; then
    echo "  → Restoring SQLite database…"
    mkdir -p "$(dirname "${DB_PATH}")"
    cp "${BACKUP_DIR}database.db" "${DB_PATH}"
    echo "  ✓ Database restored"
  fi
elif [[ "${DB_URL}" == postgresql://* ]] || [[ "${DB_URL}" == postgres://* ]]; then
  if [[ -f "${BACKUP_DIR}database.sql" ]]; then
    echo "  → Restoring PostgreSQL database…"
    PGPASSWORD="${DB_PASSWORD:-}" psql "${DB_URL}" < "${BACKUP_DIR}database.sql"
    echo "  ✓ Database restored"
  fi
fi

# 2. Storage
STORAGE_ROOT="${STORAGE_LOCAL_ROOT:-/home/z/my-project/storage}"
if [[ -f "${BACKUP_DIR}storage.tar.gz" ]]; then
  echo "  → Restoring storage…"
  mkdir -p "$(dirname "${STORAGE_ROOT}")"
  tar -xzf "${BACKUP_DIR}storage.tar.gz" -C "$(dirname "${STORAGE_ROOT}")"
  echo "  ✓ Storage restored"
fi

# 3. KEK
if [[ -f "${BACKUP_DIR}.kek" ]]; then
  echo "  → Restoring KEK…"
  cp "${BACKUP_DIR}.kek" "/home/z/my-project/.kek"
  chmod 600 "/home/z/my-project/.kek"
  echo "  ✓ KEK restored"
fi

echo "[$(date -u)] ✓ Restore complete."
echo "  Restart the application server for changes to take effect."
echo "  After restart, run: bun run db:generate"
