#!/usr/bin/env bash
# Адаптация users под Pass v2 (identity-поля).
#
#   cd /opt/pass24front && ./scripts/adapt-users.sh
#   ./scripts/adapt-users.sh --apply
#   ./scripts/adapt-users.sh --apply --sync
#
# Не монтирует весь backend поверх образа: иначе пропадают node_modules
# и npx тянет ts-node без typescript.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env"

cd "$APP_DIR"

if [[ ! -f backend/scripts/adapt-users.ts ]]; then
  echo "Нет backend/scripts/adapt-users.ts — сделайте git pull."
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Нет .env в $APP_DIR"
  exit 1
fi

$COMPOSE run --rm --no-deps \
  -v "$APP_DIR/backend/scripts:/app/scripts:ro" \
  -v "$APP_DIR/backend/src:/app/src:ro" \
  backend \
  ./node_modules/.bin/ts-node --transpile-only scripts/adapt-users.ts "$@"
