#!/usr/bin/env bash
# Ежедневный бэкап MongoDB (pass24 + pass24_auth) + опциональная выгрузка на FTP.
#
# Env (можно из /opt/pass24front/.env):
#   MONGO_CONTAINER=pass24-mongo
#   BACKUP_DIR=/opt/pass24front/backups/mongo
#   RETENTION_DAYS=7
#   BACKUP_FTP_ENABLED=true
#   BACKUP_FTP_HOST=ftp.example.com
#   BACKUP_FTP_PORT=21
#   BACKUP_FTP_USER=...
#   BACKUP_FTP_PASS=...
#   BACKUP_FTP_DIR=/pass24-backups
#   BACKUP_FTP_SSL=false
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# docker-compose .env is KEY=VAL, not bash. `source` breaks on values like
# SMTP_FROM=Name <email@host> (redirect with no filename → unexpected newline).
load_dotenv() {
  local file="$1" line key value first last
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    if [[ "$line" =~ ^export[[:space:]]+ ]]; then
      line="${line#export}"
      line="${line#"${line%%[![:space:]]*}"}"
    fi
    [[ "$line" == *"="* ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    case "$key" in
      PATH|HOME|IFS|PWD|OLDPWD|UID|EUID|PPID) continue ;;
    esac
    if [[ ${#value} -ge 2 ]]; then
      first="${value:0:1}"
      last="${value: -1}"
      if [[ "$first" == "$last" && ( "$first" == '"' || "$first" == "'" ) ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$file"
}

if [[ -f "$APP_DIR/.env" ]]; then
  load_dotenv "$APP_DIR/.env"
fi

CONTAINER="${MONGO_CONTAINER:-pass24-mongo}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups/mongo}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
# Unique per run: date AND time, e.g. 2026-09-03_10-47-53
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
FTP_SCRIPT="$SCRIPT_DIR/mongo-backup-ftp.py"

mkdir -p "$BACKUP_DIR"
if [[ "$(id -u)" -eq 0 ]]; then
  app_owner="$(stat -c '%U:%G' "$APP_DIR" 2>/dev/null || true)"
  if [[ "$app_owner" == *:* ]]; then
    chown -R "$app_owner" "$BACKUP_DIR" || true
  fi
  chmod 0775 "$BACKUP_DIR" || true
fi
if [[ ! -w "$BACKUP_DIR" ]]; then
  echo "Cannot write to $BACKUP_DIR" >&2
  ls -ld "$BACKUP_DIR" >&2 || true
  echo "Fix: sudo chown -R $(id -un):$(id -gn) $BACKUP_DIR" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Mongo container '$CONTAINER' is not running" >&2
  exit 1
fi

PASS24_FILE="$BACKUP_DIR/pass24_${STAMP}.gz"
AUTH_FILE="$BACKUP_DIR/pass24_auth_${STAMP}.gz"
suffix=1
while [[ -e "$PASS24_FILE" || -e "$AUTH_FILE" ]]; do
  suffix=$((suffix + 1))
  PASS24_FILE="$BACKUP_DIR/pass24_${STAMP}_${suffix}.gz"
  AUTH_FILE="$BACKUP_DIR/pass24_auth_${STAMP}_${suffix}.gz"
done

docker exec "$CONTAINER" mongodump --db pass24 --archive --gzip >"$PASS24_FILE"
docker exec "$CONTAINER" mongodump --db pass24_auth --archive --gzip >"$AUTH_FILE"

for f in "$PASS24_FILE" "$AUTH_FILE"; do
  size="$(wc -c <"$f" | tr -d ' ')"
  if [[ "$size" -lt 50 ]]; then
    echo "Backup file too small: $f ($size bytes)" >&2
    exit 1
  fi
done

# Локально: дата из имени — удаляем старше RETENTION_DAYS.
# Новые: pass24_YYYY-MM-DD_HH-MM-SS.gz  Старые: pass24_YYYYMMDD_HHMMSS.gz
prune_local_by_stamp() {
  local cutoff
  if date -d "${RETENTION_DAYS} days ago" +%Y%m%d >/dev/null 2>&1; then
    cutoff="$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d)"
  else
    # macOS/BSD fallback (на прод Linux не нужно)
    cutoff="$(date -v-"${RETENTION_DAYS}"d +%Y%m%d 2>/dev/null || date +%Y%m%d)"
  fi
  local f base day
  shopt -s nullglob
  for f in "$BACKUP_DIR"/pass24_*.gz "$BACKUP_DIR"/pass24_auth_*.gz; do
    base="$(basename "$f")"
    day=""
    if [[ "$base" =~ ^(pass24|pass24_auth)_([0-9]{4}-[0-9]{2}-[0-9]{2})_([0-9]{2}-[0-9]{2}-[0-9]{2})(_[0-9]+)?\.gz$ ]]; then
      day="${BASH_REMATCH[2]//-/}"
    elif [[ "$base" =~ ^(pass24|pass24_auth)_([0-9]{8})_[0-9]{6}(_[0-9]+)?\.gz$ ]]; then
      day="${BASH_REMATCH[2]}"
    fi
    if [[ -n "$day" && "$day" < "$cutoff" ]]; then
      rm -f -- "$f"
      echo "Local deleted (>${RETENTION_DAYS}d): $base"
    fi
  done
  shopt -u nullglob
}
prune_local_by_stamp

echo "Backup OK (local, retention ${RETENTION_DAYS}d):"
echo "  $PASS24_FILE"
echo "  $AUTH_FILE"

FTP_ENABLED="$(echo "${BACKUP_FTP_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')"
if [[ "$FTP_ENABLED" == "true" || "$FTP_ENABLED" == "1" || "$FTP_ENABLED" == "yes" ]]; then
  if [[ -z "${BACKUP_FTP_HOST:-}" || -z "${BACKUP_FTP_USER:-}" ]]; then
    echo "BACKUP_FTP_ENABLED=true but BACKUP_FTP_HOST/USER missing" >&2
    exit 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 required for FTP upload" >&2
    exit 1
  fi
  export RETENTION_DAYS
  export BACKUP_FTP_HOST BACKUP_FTP_USER BACKUP_FTP_PASS
  export BACKUP_FTP_PORT="${BACKUP_FTP_PORT:-21}"
  export BACKUP_FTP_DIR="${BACKUP_FTP_DIR:-/}"
  export BACKUP_FTP_SSL="${BACKUP_FTP_SSL:-false}"
  export BACKUP_FTP_PASSIVE="${BACKUP_FTP_PASSIVE:-true}"
  export BACKUP_FTP_INSECURE_SSL="${BACKUP_FTP_INSECURE_SSL:-false}"
  if python3 "$FTP_SCRIPT" "$PASS24_FILE" "$AUTH_FILE"; then
    echo "Backup OK (FTP upload + remote prune ${RETENTION_DAYS}d)"
  else
    echo "Local backup OK, FTP upload failed (see error above)" >&2
    exit 1
  fi
else
  echo "FTP skipped (set BACKUP_FTP_ENABLED=true to upload)"
fi
