#!/usr/bin/env bash
# Обновление PASS24 на сервере: git pull + пересборка контейнеров
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env"

cd "$APP_DIR"

echo "==> Fetch $BRANCH"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [[ ! -f .env ]]; then
  echo "==> Create .env from .env.production.example"
  cp .env.production.example .env
  echo "    Отредактируйте .env (JWT_SECRET, пароли) и запустите снова."
fi

echo "==> Build & start containers"
$COMPOSE up -d --build --wait --wait-timeout 180

echo "==> Prune dangling images"
docker image prune -f >/dev/null 2>&1 || true

echo "==> Done: $(date -Iseconds)"
$COMPOSE ps