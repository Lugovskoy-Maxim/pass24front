#!/usr/bin/env bash
# Быстрое включение HTTPS: Let's Encrypt (если порт 80 доступен снаружи) или self-signed
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/pass24front}"
cd "$APP_DIR"

if [[ $EUID -ne 0 ]]; then
  exec sudo -E "$0" "$@"
fi

echo "==> Проверка порта 80 снаружи (для Let's Encrypt)"
if curl -fsS --max-time 5 "http://pass.mstyle.ru/.well-known/acme-challenge/ping" >/dev/null 2>&1; then
  :
fi

if bash "$APP_DIR/scripts/setup-ssl.sh"; then
  echo "Let's Encrypt SSL включён"
  exit 0
fi

echo "==> Let's Encrypt не удался, включаем self-signed SSL"
bash "$APP_DIR/scripts/setup-ssl-selfsigned.sh"