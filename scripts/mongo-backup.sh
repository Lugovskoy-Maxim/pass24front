#!/usr/bin/env bash
# Ежедневный бэкап MongoDB (pass24 + pass24_auth)
set -euo pipefail

CONTAINER="${MONGO_CONTAINER:-pass24-mongo}"
BACKUP_DIR="${BACKUP_DIR:-/opt/pass24front/backups/mongo}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Mongo container '$CONTAINER' is not running" >&2
  exit 1
fi

docker exec "$CONTAINER" mongodump --db pass24 --archive --gzip \
  > "$BACKUP_DIR/pass24_${STAMP}.gz"
docker exec "$CONTAINER" mongodump --db pass24_auth --archive --gzip \
  > "$BACKUP_DIR/pass24_auth_${STAMP}.gz"

find "$BACKUP_DIR" -name 'pass24_*.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name 'pass24_auth_*.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

echo "Backup OK: $BACKUP_DIR/pass24_${STAMP}.gz, pass24_auth_${STAMP}.gz"