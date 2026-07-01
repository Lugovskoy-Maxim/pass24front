#!/usr/bin/env bash
# Первичная установка на Ubuntu/Debian (Docker, nginx, clone, deploy)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/pass24front}"
REPO_URL="${REPO_URL:-https://github.com/Lugovskoy-Maxim/pass24front.git}"
BRANCH="${BRANCH:-main}"
PUBLIC_IP="${PUBLIC_IP:-188.64.164.202}"

if [[ $EUID -ne 0 ]]; then
  echo "Запустите с sudo: sudo ./scripts/install-server.sh"
  exit 1
fi

echo "==> Install packages"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates nginx

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Install Docker"
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker nginx

DEPLOY_USER="${SUDO_USER:-user}"
usermod -aG docker "$DEPLOY_USER" 2>/dev/null || true

echo "==> Clone project to $APP_DIR"
mkdir -p "$(dirname "$APP_DIR")"
if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo -u "$DEPLOY_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
fi

cd "$APP_DIR"
sudo -u "$DEPLOY_USER" git fetch origin
sudo -u "$DEPLOY_USER" git checkout "$BRANCH"
sudo -u "$DEPLOY_USER" git pull --ff-only origin "$BRANCH" || true

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.production.example" "$APP_DIR/.env"
  JWT=$(openssl rand -hex 32)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" "$APP_DIR/.env"
  sed -i "s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=http://$PUBLIC_IP|" "$APP_DIR/.env"
  sed -i "s|^PUBLIC_API_URL=.*|PUBLIC_API_URL=http://$PUBLIC_IP/api|" "$APP_DIR/.env"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
fi

echo "==> Nginx site"
cp "$APP_DIR/deploy/nginx/pass24.conf" /etc/nginx/sites-available/pass24
ln -sf /etc/nginx/sites-available/pass24 /etc/nginx/sites-enabled/pass24
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Start application"
sudo -u "$DEPLOY_USER" bash -lc "cd '$APP_DIR' && chmod +x scripts/*.sh && ./scripts/update.sh"

echo ""
echo "Готово: http://$PUBLIC_IP"
echo "Обновление: cd $APP_DIR && ./scripts/update.sh"