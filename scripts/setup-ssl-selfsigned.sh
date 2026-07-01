#!/usr/bin/env bash
# Временный self-signed SSL (пока не исправлены DNS и NAT для Let's Encrypt)
set -euo pipefail

DOMAIN="${DOMAIN:-pass.mstyle.ru}"
PUBLIC_IP="${PUBLIC_IP:-188.64.164.202}"
LAN_IP="${LAN_IP:-192.168.200.9}"
APP_DIR="${APP_DIR:-/opt/pass24front}"

if [[ $EUID -ne 0 ]]; then
  echo "sudo ./scripts/setup-ssl-selfsigned.sh"
  exit 1
fi

CRT=/etc/ssl/certs/pass.mstyle.ru.crt
KEY=/etc/ssl/private/pass.mstyle.ru.key

if [[ ! -f "$CRT" ]]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY" -out "$CRT" \
    -subj "/CN=$DOMAIN/O=PASS24/C=RU" \
    -addext "subjectAltName=DNS:$DOMAIN,IP:$PUBLIC_IP,IP:$LAN_IP"
  chmod 600 "$KEY"
fi

cp "$APP_DIR/deploy/nginx/pass24.conf" /etc/nginx/sites-available/pass24
cp "$APP_DIR/deploy/nginx/pass24-ssl-selfsigned.conf" /etc/nginx/sites-available/pass24-ssl
ln -sf /etc/nginx/sites-available/pass24 /etc/nginx/sites-enabled/pass24
ln -sf /etc/nginx/sites-available/pass24-ssl /etc/nginx/sites-enabled/pass24-ssl
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  sed -i "s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=https://$DOMAIN|" "$ENV_FILE"
  sed -i "s|^PUBLIC_API_URL=.*|PUBLIC_API_URL=https://$DOMAIN/api|" "$ENV_FILE"
  DEPLOY_USER="${SUDO_USER:-user}"
  sudo -u "$DEPLOY_USER" bash -lc "cd '$APP_DIR' && ./scripts/update.sh"
fi

echo "Self-signed SSL: https://$LAN_IP (браузер покажет предупреждение)"
echo "После исправления DNS запустите: sudo ./scripts/setup-ssl.sh"