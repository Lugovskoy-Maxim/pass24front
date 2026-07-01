#!/usr/bin/env bash
# Выпуск Let's Encrypt и включение HTTPS для pass.mstyle.ru
set -euo pipefail

DOMAIN="${DOMAIN:-pass.mstyle.ru}"
EMAIL="${SSL_EMAIL:-admin@mstyle.ru}"
APP_DIR="${APP_DIR:-/opt/pass24front}"

if [[ $EUID -ne 0 ]]; then
  echo "Запустите: sudo ./scripts/setup-ssl.sh"
  exit 1
fi

echo "==> Проверка DNS: $DOMAIN"
RESOLVED=$(getent ahosts "$DOMAIN" | awk '{print $1; exit}')
echo "    $DOMAIN -> ${RESOLVED:-не найден}"
echo "    Ожидается: 188.64.164.202 (или ваш белый IP)"

apt-get update -qq
apt-get install -y -qq certbot

mkdir -p /var/www/certbot
cp "$APP_DIR/deploy/nginx/pass24.conf" /etc/nginx/sites-available/pass24
rm -f /etc/nginx/sites-enabled/pass24-ssl
ln -sf /etc/nginx/sites-available/pass24 /etc/nginx/sites-enabled/pass24
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Выпуск сертификата Let's Encrypt"
certbot certonly --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive

echo "==> Включение HTTPS"
cp "$APP_DIR/deploy/nginx/pass24-ssl.conf" /etc/nginx/sites-available/pass24-ssl
ln -sf /etc/nginx/sites-available/pass24-ssl /etc/nginx/sites-enabled/pass24-ssl
nginx -t
systemctl reload nginx

# Автообновление
if [[ ! -f /etc/cron.d/certbot-pass24 ]]; then
  echo "0 3 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-pass24
fi

echo "==> Обновление .env приложения"
ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  sed -i "s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=https://$DOMAIN|" "$ENV_FILE"
  sed -i "s|^PUBLIC_API_URL=.*|PUBLIC_API_URL=https://$DOMAIN/api|" "$ENV_FILE"
  DEPLOY_USER="${SUDO_USER:-user}"
  sudo -u "$DEPLOY_USER" bash -lc "cd '$APP_DIR' && ./scripts/update.sh"
fi

echo ""
echo "Готово: https://$DOMAIN"