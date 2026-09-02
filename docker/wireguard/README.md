# WireGuard client for Telegram Bot API

Контейнер `wireguard` поднимает **клиент** WG. Сервис `telegram-gateway`
использует `network_mode: service:wireguard`, поэтому запросы к
`api.telegram.org` идут через VPN. Backend остаётся в обычной Docker-сети и
ходит к gateway по HTTP на хост `wireguard:8091` (общий network namespace).

## Быстрый старт

1. Положите клиентский конфиг провайдера VPN:

```bash
cp wg0.conf.example wg0.conf
# отредактируйте PrivateKey / Address / Peer Endpoint / AllowedIPs
```

Для образа `linuxserver/wireguard` обычно достаточно файла:

`docker/wireguard/wg_confs/wg0.conf`

(образ linuxserver монтирует `./docker/wireguard` → `/config`).

2. Задайте секреты в `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
TELEGRAM_GATEWAY_TOKEN=long-random-string
TELEGRAM_BOT_USERNAME=mstyleauthbot
```

3. Поднимите профиль `telegram`:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env \
  --profile telegram up -d --build wireguard telegram-gateway
```

На Linux хосту нужны права на `/dev/net/tun` (уже в compose).

## Проверка

```bash
curl -s http://127.0.0.1:8091/health
docker compose --profile telegram exec wireguard curl -s https://api.telegram.org
```

Если Bot API недоступен без VPN — после поднятия WG `curl` из netns wireguard
должен отвечать.

## Важно

- Не коммитьте `wg0.conf` с реальными ключами (см. `.gitignore`).
- `AllowedIPs` лучше ограничить маршрутами до Telegram / нужных подсетей,
  а не `0.0.0.0/0`, если не хотите гнать весь трафик контейнера в VPN.
- Backend **не** сажаем в WG: Mongo/SMTP/SMS Aero остаются прямыми.
