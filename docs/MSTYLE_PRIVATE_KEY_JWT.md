# Mstyle: `private_key_jwt` в production

В интеграции используются два OAuth-клиента:

| Клиент                  | Назначение                                                          | Разрешённые scopes             |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------ |
| `mstyle-backend-prod`   | внешняя авторизация, резиденты, профили, контакты, гости, изменения | полный набор scopes Mstyle API |
| `mstyle-reconcile-prod` | чтение ленты изменений                                              | только `mstyle.changes.read`   |

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
MSTYLE_CLIENT_SCOPES=mstyle.resident.authenticate mstyle.residents.read mstyle.residents.write mstyle.profiles.read mstyle.profiles.write mstyle.memberships.read mstyle.memberships.write mstyle.contacts.read mstyle.contacts.write mstyle.consents.read mstyle.consents.write mstyle.private-data.read mstyle.private-data.write mstyle.guests.read mstyle.guests.write mstyle.admin.search mstyle.changes.read

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

## Требования к `client_assertion`

- `alg`: `RS256` или `ES256`;
- `iss` и `sub`: точный `client_id`;
- `aud`: URL token endpoint, обычно `https://pass.mstyle.ru/api/oauth2/token`;
- `exp - iat`: не более 60 секунд;
- `jti`: уникальный для каждой попытки получения токена.

Assertion передаётся в `POST /api/oauth2/token` вместе с
`grant_type=client_credentials`, `client_id` и
`client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`.

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
