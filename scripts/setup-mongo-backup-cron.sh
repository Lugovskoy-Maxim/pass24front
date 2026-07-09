#!/usr/bin/env bash
# Установка ежедневного бэкапа MongoDB в 02:00
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_SCRIPT="$APP_DIR/scripts/mongo-backup.sh"
CRON_FILE="/etc/cron.d/pass24-mongo-backup"
LOG_FILE="/var/log/pass24-mongo-backup.log"

chmod +x "$BACKUP_SCRIPT"

CRON_LINE="0 2 * * * root $BACKUP_SCRIPT >> $LOG_FILE 2>&1"

if [[ -f "$CRON_FILE" ]] && grep -qF "$BACKUP_SCRIPT" "$CRON_FILE" 2>/dev/null; then
  echo "Cron already configured: $CRON_FILE"
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

echo "$CRON_LINE" > "$CRON_FILE"
chmod 644 "$CRON_FILE"
touch "$LOG_FILE"
echo "Installed daily backup cron: $CRON_FILE"