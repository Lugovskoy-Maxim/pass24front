#!/usr/bin/env bash
# Обновление PASS24 на сервере: git pull main + пересборка контейнеров
#
# Использование:
#   cd /opt/pass24front && ./scripts/update.sh
#   NO_CACHE=1 ./scripts/update.sh    # пересборка образов без Docker cache
#
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env"
NO_CACHE="${NO_CACHE:-0}"

cd "$APP_DIR"

echo "==> Каталог: $APP_DIR"
echo "==> Ветка: $BRANCH"

# Сброс локальных правок на сервере (иначе pull может не пройти)
git checkout -- . 2>/dev/null || true
git clean -fd 2>/dev/null || true
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

COMMIT=$(git rev-parse --short HEAD)
SUBJECT=$(git log -1 --pretty=%s)
echo "    Коммит: $COMMIT — $SUBJECT"

# Минимальная проверка, что frontend с нужным фиксом typecheck
if ! grep -q "filters.search ?? ''" frontend/src/app/admin/users/page.tsx 2>/dev/null; then
  echo "WARNING: в admin/users/page.tsx нет фикса debouncedSearch (filters.search ?? '')."
  echo "         Убедитесь, что pull подтянул коммит 0a2520e или новее."
fi

chmod +x scripts/*.sh 2>/dev/null || true

if [[ ! -f .env ]]; then
  echo "==> Создание .env из .env.production.example"
  cp .env.production.example .env
  JWT=$(openssl rand -hex 32)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
  echo "    Задайте ADMIN_PASSWORD в .env и запустите снова."
  exit 1
fi

echo "==> Сборка и запуск контейнеров"
if [[ "$NO_CACHE" == "1" ]]; then
  echo "    Режим: без Docker cache (NO_CACHE=1)"
  $COMPOSE build --no-cache
  $COMPOSE up -d --wait --wait-timeout 180
else
  $COMPOSE up -d --build --wait --wait-timeout 180
fi

echo "==> Очистка старых образов"
docker image prune -f >/dev/null 2>&1 || true

if [[ -x scripts/setup-mongo-backup-cron.sh ]]; then
  sudo scripts/setup-mongo-backup-cron.sh 2>/dev/null || true
fi

echo ""
echo "==> Готово: $(date -Iseconds)"
echo "    Коммит: $COMMIT"
echo "    Сайт: ${PUBLIC_APP_URL:-https://pass.mstyle.ru}"
$COMPOSE ps
