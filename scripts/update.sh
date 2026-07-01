#!/usr/bin/env bash
# Обновление PASS24 на сервере: git pull main + пересборка контейнеров
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env"

cd "$APP_DIR"
chmod +x scripts/*.sh 2>/dev/null || true

echo "==> Ветка: $BRANCH"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
echo "    Коммит: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

if [[ ! -f .env ]]; then
  echo "==> Создание .env из .env.production.example"
  cp .env.production.example .env
  JWT=$(openssl rand -hex 32)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
  echo "    Задайте ADMIN_PASSWORD в .env и запустите снова."
  exit 1
fi

echo "==> Сборка и запуск контейнеров"
$COMPOSE up -d --build --wait --wait-timeout 180

echo "==> Очистка старых образов"
docker image prune -f >/dev/null 2>&1 || true

echo ""
echo "==> Готово: $(date -Iseconds)"
echo "    Сайт: ${PUBLIC_APP_URL:-https://pass.mstyle.ru}"
$COMPOSE ps