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
MSTYLE_TELEGRAM_BOT=m_style_office_bot
TELEGRAM_GATEWAY_URL=http://wireguard:8091
TELEGRAM_POLL=true
MSTYLE_DISPATCH_ENABLED=true
MSTYLE_MOCK_RESPONSES=false
COMPOSE_PROFILES=telegram
```

3. Поднимите профиль `telegram`:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env \
  --profile telegram up -d --build wireguard telegram-gateway
```

На Linux хосту нужны права на `/dev/net/tun` (уже в compose).
`COMPOSE_PROFILES=telegram` сохраняет включённый профиль для последующих запусков
`scripts/update.sh`. Токен должен принадлежать именно `@m_style_office_bot`.
После изменения окружения пересоздайте также backend:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env \
  --profile telegram up -d --build --force-recreate telegram-gateway backend
```

В админке PASS отключите mock-ответы. Сохранённая настройка имеет приоритет над `.env`.

## Получение кода

1. Запросите challenge с `identifier.type=phone`, `channel=telegram` для активного арендатора.
2. Откройте `telegramAction.deepLink` из ответа и нажмите «Запустить» в личном чате бота.
3. Нажмите «Подтвердить мой номер» и поделитесь своим контактом Telegram.
4. Если номер совпадает с номером входа, бот отправит код. Введите его в приложении.

Чужой контакт, текстовый номер и сообщения из групп не позволяют получить код.
При повторной отправке кода снова откройте ссылку и подтвердите контакт.
Коды хранятся только в памяти gateway до истечения challenge (не более 5 минут).
После перезапуска gateway нужно запросить новый код.

## Проверка

```bash
curl -s http://127.0.0.1:8091/health
docker compose --profile telegram exec wireguard curl -s https://api.telegram.org
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env \
  --profile telegram logs -f --tail=100 telegram-gateway backend
```

Если Bot API недоступен без VPN — после поднятия WG `curl` из netns wireguard
должен отвечать.

`/health` возвращает 200 только после проверки токена, имени бота и отсутствия webhook.
Если там 503, смотрите логи: неверный токен, несовпадение имени, недоступность Telegram
или активный webhook. Этот gateway получает сообщения через polling: другой polling-процесс
с тем же токеном запускать нельзя. Существующий webhook автоматически не удаляется;
перед переключением остановите прежний обработчик и удалите webhook через Bot API.
Коды, телефоны и токены не записываются в логи gateway.

## Важно

- Не коммитьте `wg0.conf` с реальными ключами (см. `.gitignore`).
- `AllowedIPs` лучше ограничить маршрутами до Telegram / нужных подсетей,
  а не `0.0.0.0/0`, если не хотите гнать весь трафик контейнера в VPN.
- Backend **не** сажаем в WG: Mongo/SMTP/SMS Aero остаются прямыми.
