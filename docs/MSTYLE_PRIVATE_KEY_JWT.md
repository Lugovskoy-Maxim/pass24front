# Mstyle: `private_key_jwt` в production

В интеграции используются два OAuth-клиента:

| Клиент                  | Назначение                                           | Разрешённые scopes                                   |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `mstyle-backend-prod`   | вход резидента и получение его контекста с профилями | `mstyle.resident.authenticate mstyle.residents.read` |
| `mstyle-reconcile-prod` | чтение ленты изменений                               | только `mstyle.changes.read`                         |

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
MSTYLE_CLIENT_PUBLIC_KEY_FILE=/run/secrets/mstyle-backend-prod-public.pem
MSTYLE_CLIENT_SCOPES=mstyle.resident.authenticate mstyle.residents.read

MSTYLE_RECONCILE_CLIENT_ID=mstyle-reconcile-prod
MSTYLE_RECONCILE_CLIENT_AUTH=private_key_jwt
MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY_FILE=/run/secrets/mstyle-reconcile-prod-public.pem
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
