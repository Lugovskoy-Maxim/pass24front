# Обновление PASS24 на сервере

На продакшене всегда используется ветка **`main`**.

Сайт: **https://pass.mstyle.ru**

---

## Быстрое обновление (1 команда)

Подключитесь по SSH и выполните:

```bash
cd /opt/pass24front && ./scripts/update.sh
```

Скрипт сам:

1. Переключится на `main`
2. Скачает последние изменения с GitHub
3. Пересоберёт и перезапустит Docker-контейнеры

В начале вывода должно быть что-то вроде:
`Коммит: 0a2520e — fix(build): type debouncedSearch...`  
(актуальный короткий hash с `main`).

Если сборка frontend падает со **старой** ошибкой TypeScript, а коммит уже новый — пересоберите без кэша:

```bash
cd /opt/pass24front && NO_CACHE=1 ./scripts/update.sh
```

---

## Пошагово (если нужно вручную)

### Если не приходит код по почте

В `/opt/pass24front/.env` задайте каждую переменную отдельной строкой:

```dotenv
SMTP_HOST=smtp.spaceweb.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=pass@mstyle.ru
SMTP_PASS=REPLACE_WITH_MAILBOX_PASSWORD
SMTP_FROM="Пропуск.М-Стиль Офис <pass@mstyle.ru>"
MSTYLE_DISPATCH_ENABLED=true
MSTYLE_MOCK_RESPONSES=false
MSTYLE_TELEGRAM_BOT=m_style_office_bot
```

Не заменяйте весь `.env`: сохраните остальные настройки и текущие секреты.
Проверьте, что режим mock также выключен в админке: сохранённая настройка
имеет приоритет над начальным значением из окружения.
`SMTP_HOST=mailpit` оставляет письма в тестовом почтовом ящике, наружу они не уходят.
Внешняя авторизация отправляет код только существующему активному арендатору.
Для неизвестной или неактивной записи возвращается такой же ответ 202 без письма,
чтобы API не раскрывал наличие учётной записи.

После изменения `.env` пересоздайте backend (обычный restart не обновляет окружение):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d --build --force-recreate backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env logs -f --tail=200 backend
```

В логах `OTP dispatch disabled` означает выключенную отправку,
`no eligible identity` — отсутствие подходящего активного пользователя,
`email OTP dispatch failed` — ошибку SMTP,
`Email OTP submitted to SMTP` — передачу письма SMTP-серверу (не подтверждение доставки во входящие).
Имя Telegram-бота в `.env` имеет приоритет над значением по умолчанию в коде.

### Обновление вручную

```bash
ssh user@192.168.200.9
cd /opt/pass24front
git fetch origin
git checkout main
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d --build --wait
```

---

## Первый запуск / супер-администратор

При **первом** старте backend автоматически создаёт **одного** супер-администратора (если такого email ещё нет в базе).

Настройки в `/opt/pass24front/.env`:

| Переменная        | Описание                                       |
| ----------------- | ---------------------------------------------- |
| `ADMIN_EMAIL`     | Email для входа                                |
| `ADMIN_PASSWORD`  | Пароль (задайте свой!)                         |
| `ADMIN_FULL_NAME` | Имя в системе                                  |
| `ADMIN_ROLE`      | `admin` — супер-администратор со всеми правами |
| `SEED_DEV_DATA`   | `false` на проде — без тестовых аккаунтов      |

По умолчанию (если не меняли `.env`):

- **Email:** `admin@pass24.local`
- **Пароль:** `admin123` — **смените в `.env` до первого запуска!**

Вход: **https://pass.mstyle.ru/login** → раздел **Админ**.

> Если супер-админ уже создан, повторно не создаётся. Чтобы сменить пароль — измените пользователя в админ-панели или в MongoDB.

---

## Обновление с develop → main (для разработчика)

На своём компьютере, после готовности фичи в `develop`:

```bash
git checkout develop
git pull origin develop
git checkout main
git merge develop
git push origin main
```

На сервере:

```bash
cd /opt/pass24front && ./scripts/update.sh
```

---

## Проверка после обновления

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://pass.mstyle.ru/login
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env logs -f backend --tail 30
```

В логах backend при первом запуске должно быть:
`Супер-администратор создан: ...` или `Супер-администратор уже существует: ...`

### Проверка OAuth и Mstyle v2 API

С машины, где лежат private/public пары ключей:

```bash
cd /opt/pass24front

# Только token endpoint, без печати access token
MSTYLE_KEYS_DIR=/path/to/private-and-public-keys \
node scripts/check-mstyle-oauth.js

# OAuth + несколько M0 маршрутов закрытого API
MSTYLE_KEYS_DIR=/path/to/private-and-public-keys \
node scripts/check-mstyle-v2-smoke.js
```

Если ключи названы не как `<kid>-private.pem` и `<kid>-public.pem`, задайте
явные пути:

```bash
MSTYLE_CLIENT_ID=mstyle-backend-prod \
MSTYLE_CLIENT_KID=mstyle-backend-prod-20260823-01 \
MSTYLE_CLIENT_PRIVATE_KEY_FILE=/path/to/private.pem \
MSTYLE_CLIENT_PUBLIC_KEY_FILE=/path/to/public.pem \
node scripts/check-mstyle-v2-smoke.js
```

---

## Адаптация пользователей под Pass v2

Скрипт дописывает поля identity (`passSubject`, `identityStatus`, `authVersion`, `profileType`, `legalForm`). Пароли, OTP и уже выданный `passSubject` не трогает. Анкету ПДн (ИНН/ОГРН) не заполняет.

По умолчанию только просмотр. `--apply` пишет в Mongo и кладёт бэкап в `backend/backups/adapt-users/`.

```bash
cd /opt/pass24front
git checkout -- scripts/adapt-users.sh   # если pull ругается на локальные правки
git pull --ff-only origin main
chmod +x scripts/*.sh

# 1) что будет изменено (ничего не пишет)
./scripts/adapt-users.sh

# 2) записать, если wouldUpdate / samples выглядят нормально
./scripts/adapt-users.sh --apply

# 3) плюс профили закрытого API (prf_…)
./scripts/adapt-users.sh --apply --sync
```

Не вызывайте `npx ts-node` и не монтируйте весь `backend` в `/app` — пропадают `node_modules`, ts-node падает (`fileExists` или TS5109). Только `./scripts/adapt-users.sh`.

Проверка: Админ → Пользователи — у карточки есть `usr_…` и `authVersion`. Повторный просмотр почти всех кладёт в `skipped`.

---

## SSL (если понадобится обновить сертификат)

```bash
cd /opt/pass24front
sudo ./scripts/setup-ssl.sh
```

---

## Частые проблемы

| Проблема                                 | Решение                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `Permission denied` на скрипт            | `chmod +x scripts/*.sh`                                                    |
| Старая версия фронта                     | `./scripts/update.sh` (пересобирает образы)                                |
| Нет `.env`                               | `cp .env.production.example .env` и задайте `JWT_SECRET`, `ADMIN_PASSWORD` |
| Сайт не открывается снаружи              | Проверьте NAT на MikroTik: TCP 80 и 443 → `192.168.200.9`                  |
| `ts-node` / `fileExists` при adapt:users | Используйте `./scripts/adapt-users.sh`, не `npx ts-node`                   |
