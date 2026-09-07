# Mstyle: `private_key_jwt` в production

В интеграции используются два OAuth-клиента:

| Клиент                  | Назначение                                                          | Разрешённые scopes             |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------ |
| `mstyle-backend-prod`   | внешняя авторизация, резиденты, профили, контакты, гости, изменения | полный набор scopes Mstyle API |
| `mstyle-reconcile-prod` | чтение ленты изменений                                              | только `mstyle.changes.read`   |

`MSTYLE_CLIENT_SCOPES` задаёт разрешённый список прав для
`mstyle-backend-prod`. В каждом запросе A-01 параметр `scope` должен содержать
ровно одно право из этого списка. Если scope не передан, передано несколько
прав или право не входит в список, Pass возвращает `invalid_scope`.

## Где должны находиться ключи

Приватные PEM-ключи остаются на сервере Mstyle/WordPress и используются только
для создания `client_assertion`. В Pass передаются соответствующие **публичные**
ключи. Приватные ключи нельзя копировать в этот репозиторий, `.env` Pass или
backend-контейнер.

Публичную часть получают на сервере, где хранится приватный ключ:

```bash
openssl pkey -in <client-private.pem> -pubout -out <client-public.pem>
```

## Конфигурация Pass

Публичный ключ можно передать как PEM с экранированными `\n` либо как путь к
файлу, доступному **внутри** backend-контейнера:

```dotenv
MSTYLE_PRIVATE_API_ENABLED=true
MSTYLE_PUBLIC_BASE_URL=https://pass.mstyle.ru

MSTYLE_CLIENT_ID=mstyle-backend-prod
MSTYLE_CLIENT_AUTH=private_key_jwt
MSTYLE_CLIENT_KID=mstyle-backend-prod-20260823-01
MSTYLE_CLIENT_PUBLIC_KEY_FILE=/app/config/oauth-public-keys/mstyle-backend-prod-20260823-01-public.pem
MSTYLE_CLIENT_SCOPES=mstyle.resident.authenticate mstyle.resident.context.read mstyle.residents.read mstyle.residents.write mstyle.profiles.read mstyle.profiles.write mstyle.memberships.read mstyle.memberships.write mstyle.contacts.read mstyle.contacts.write mstyle.consents.read mstyle.consents.write mstyle.private-data.read mstyle.private-data.write mstyle.guests.read mstyle.guests.write mstyle.admin.search mstyle.changes.read

MSTYLE_RECONCILE_CLIENT_ID=mstyle-reconcile-prod
MSTYLE_RECONCILE_CLIENT_AUTH=private_key_jwt
MSTYLE_RECONCILE_CLIENT_KID=mstyle-reconcile-prod-20260823-01
MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY_FILE=/app/config/oauth-public-keys/mstyle-reconcile-prod-20260823-01-public.pem
```

Если используются `*_PUBLIC_KEY_FILE`, публичные файлы нужно смонтировать в
backend-контейнер read-only. Альтернатива без mount:

```dotenv
MSTYLE_CLIENT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Reconcile-клиент программно ограничен `mstyle.changes.read`, даже если запросит
другие scopes. Токен этого клиента подходит для:

```http
GET /api/internal/integrations/mstyle/v2/changes?after=<cursor>&limit=50
Authorization: Bearer <service-token>
```

## SMS Aero для входа по телефону

Маршруты A-03–A-06 используют SMS Aero Mobile ID для пары `phone + sms`, если
в backend-контейнер переданы настройки:

```dotenv
MSTYLE_SMS_ENABLED=true
MSTYLE_SMSAERO_EMAIL=...
MSTYLE_SMSAERO_API_KEY=...
MSTYLE_SMSAERO_SIGN=APPROVED_MOBILE_AUTH_NAME
MSTYLE_SMSAERO_CALLBACK_URL=https://pass.mstyle.ru/api/sms/mobile-id/callback
MSTYLE_DISPATCH_ENABLED=true
MSTYLE_MOCK_RESPONSES=false
MSTYLE_MOCK_OTP=1234
```

Это отдельный кабинет SMS Aero для `mstyle.ru`. Регистрация PASS продолжает
использовать `SMS_ENABLED` и `SMSAERO_*`. V2 не подставляет их при отсутствии своих
настроек. Имя Mobile Auth берётся из нового кабинета; OAuth `client_id` и RS256
не являются учётными данными SMS Aero.

- A-03 запускает SIM-PUSH с SMS fallback;
- A-04 проверяет статус SIM-PUSH и при подтверждении возвращает
  `status: consumed` вместе с `authentication`;
- A-05 создаёт новый запрос Mobile ID;
- A-06 проверяет четырёхзначный SMS-код через SMS Aero.

Для неизвестного или недоступного резидента внешний запрос не отправляется, а
ответ не раскрывает существование учётной записи.

## Требования к `client_assertion`

- `alg`: `RS256` или `ES256`;
- `iss` и `sub`: точный `client_id`;
- `aud`: URL token endpoint, обычно `https://pass.mstyle.ru/api/oauth2/token`;
- `exp - iat`: не более 60 секунд;
- `jti`: уникальный для каждой попытки получения токена.

Assertion передаётся в `POST /api/oauth2/token` вместе с
`grant_type=client_credentials`, `client_id` и
`client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`.

Пример значения `scope` для входа резидента:

```text
scope=mstyle.resident.authenticate
```

Для проверки других M0 endpoint нужно получать отдельный токен с нужным одним
scope, например `mstyle.profiles.read`, `mstyle.contacts.write` или
`mstyle.guests.write`.

## Проверка и логи Docker на сервере

После обновления кода token endpoint должен отвечать `200 OK`:

```bash
cd /opt/pass24front
./update.sh
```

Посмотреть последние логи backend:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env logs --tail=200 backend
```

Смотреть backend-логи в реальном времени:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env logs -f backend
```

Если удобнее по имени контейнера:

```bash
docker logs --tail=200 pass24-backend
docker logs -f pass24-backend
```

Проверить, какие OAuth-переменные реально попали в контейнер:

```bash
docker exec pass24-backend printenv | grep '^MSTYLE_'
```

Проверить OAuth с машины, где лежат private/public пары ключей. Скрипт делает
отдельный token-запрос на каждый разрешённый scope и не печатает access token:

```bash
MSTYLE_KEYS_DIR=/path/to/private-and-public-keys node scripts/check-mstyle-oauth.js
```

Проверить только один scope backend-клиента:

```bash
MSTYLE_CLIENT_SCOPES=mstyle.profiles.read \
MSTYLE_CHECK_CLIENTS=backend \
MSTYLE_KEYS_DIR=/path/to/private-and-public-keys \
node scripts/check-mstyle-oauth.js
```

Для reconcile-клиента отдельно:

```bash
MSTYLE_CHECK_CLIENTS=reconcile \
MSTYLE_KEYS_DIR=/path/to/private-and-public-keys \
node scripts/check-mstyle-oauth.js
```

## Smoke-проверка Mstyle v2 API

После OAuth можно проверить закрытый API одной командой. Скрипт получает
отдельный token под каждый scope, не печатает access token, создаёт тестовый
профиль/гостя с уникальным `smoke-*` префиксом и проверяет `X-Request-ID`,
`Idempotency-Key`, `ETag`/`If-Match`:

```bash
cd /opt/pass24front
MSTYLE_KEYS_DIR=/path/to/private-and-public-keys \
node scripts/check-mstyle-v2-smoke.js
```

Если ключи названы нестандартно:

```bash
MSTYLE_CLIENT_ID=mstyle-backend-prod \
MSTYLE_CLIENT_KID=mstyle-backend-prod-20260823-01 \
MSTYLE_CLIENT_PRIVATE_KEY_FILE=/path/to/mstyle-backend-prod-20260823-01-private.pem \
MSTYLE_CLIENT_PUBLIC_KEY_FILE=/path/to/mstyle-backend-prod-20260823-01-public.pem \
node scripts/check-mstyle-v2-smoke.js
```

Для проверки другого адреса:

```bash
MSTYLE_API_BASE_URL=https://pass.mstyle.ru/api \
MSTYLE_KEYS_DIR=/path/to/private-and-public-keys \
node scripts/check-mstyle-v2-smoke.js
```
