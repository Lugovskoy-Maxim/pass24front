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

---

## Пошагово (если нужно вручную)

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

| Переменная | Описание |
|------------|----------|
| `ADMIN_EMAIL` | Email для входа |
| `ADMIN_PASSWORD` | Пароль (задайте свой!) |
| `ADMIN_FULL_NAME` | Имя в системе |
| `ADMIN_ROLE` | `admin` — супер-администратор со всеми правами |
| `SEED_DEV_DATA` | `false` на проде — без тестовых аккаунтов |

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

---

## SSL (если понадобится обновить сертификат)

```bash
cd /opt/pass24front
sudo ./scripts/setup-ssl.sh
```

---

## Частые проблемы

| Проблема | Решение |
|----------|---------|
| `Permission denied` на скрипт | `chmod +x scripts/*.sh` |
| Старая версия фронта | `./scripts/update.sh` (пересобирает образы) |
| Нет `.env` | `cp .env.production.example .env` и задайте `JWT_SECRET`, `ADMIN_PASSWORD` |
| Сайт не открывается снаружи | Проверьте NAT на MikroTik: TCP 80 и 443 → `192.168.200.9` |