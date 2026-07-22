# Руководство разработчика

## Стек

| Слой | Технологии |
|------|------------|
| Backend | NestJS 11, Mongoose 9, Passport JWT, class-validator, Nodemailer |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4, Lucide |
| БД | MongoDB 7 (две логические БД, см. [ARCHITECTURE.md](./ARCHITECTURE.md)) |
| Инфра | Docker Compose, nginx (prod), Mailpit (dev SMTP), SMS Aero (SMS OTP) |

## Требования

- Node.js **≥ 20.19** (желательно LTS 20/22; MongoDB-драйвер требует ≥ 20.19)
- npm 10+
- Docker + Docker Compose (рекомендуется для полного стека)
- Git

## Быстрый старт (Docker)

```bash
# из корня репозитория
docker compose up --build
```

| Сервис | URL |
|--------|-----|
| Frontend | http://127.0.0.1:3000 |
| API | http://127.0.0.1:4000/api |
| Swagger | http://127.0.0.1:4000/api/docs |
| Mailpit (письма) | http://127.0.0.1:8025 |
| MongoDB | localhost:27017 |

Горячая перезагрузка:

```bash
docker compose -f docker-compose.dev.yml up --build
```

> В `docker-compose.dev.yml` переменные SMS по умолчанию **не** прокинуты — добавьте при необходимости.

## Локальный запуск без Docker

### 1. MongoDB

Локально или в Docker только Mongo:

```bash
docker compose up mongo -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # отредактируйте при необходимости
npm ci
npm run start:dev
```

API: `http://127.0.0.1:4000/api`

Seed супер-админа выполняется при старте (`SeedService`), если учётки ещё нет.  
Тестовые роли/данные: `SEED_DEV_DATA=true` (по умолчанию вне production).

### 3. Frontend

```bash
cd frontend
# NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api" > .env.local
npm ci
npm run dev
```

UI: `http://127.0.0.1:3000`

## Переменные окружения

### Backend (`backend/.env` или compose)

| Переменная | Назначение |
|------------|------------|
| `MONGODB_URI` | Операционные данные: пропуска, офисы, audit, app_settings |
| `MONGODB_AUTH_URI` | Пользователи / identity (`pass24_auth`) |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | JWT |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Первый супер-админ |
| `SMTP_*` | Почта (коды регистрации, сброс пароля, билеты) |
| `PUBLIC_APP_URL` | Ссылки в письмах |
| `SMSAERO_EMAIL` / `SMSAERO_API_KEY` / `SMSAERO_SIGN` | SMS Aero |
| `SMS_ENABLED` | `true` — реальная отправка SMS |
| `SEED_DEV_DATA` | Сиды тестовых учёток/БЦ |
| `CORS_ORIGIN` | CORS (опционально) |

Примеры: `backend/.env.example`, `.env.production.example`.

### Frontend

| Переменная | Назначение |
|------------|------------|
| `NEXT_PUBLIC_API_URL` | Базовый URL API **с** `/api`, напр. `http://127.0.0.1:4000/api` |

Задаётся на **build-time** в Docker (`ARG` в `frontend/Dockerfile`).

## Структура репозитория

```
pass24front/
├── backend/src/
│   ├── access/          # права и типы пропусков
│   ├── admin/           # админ-API
│   ├── auth/            # login, регистрация, сотрудники, сброс пароля
│   ├── passes/          # пропуска, шаблоны, public ticket
│   ├── site-settings/   # бренд, FAQ, инструкции, UI labels
│   ├── sms/             # SMS Aero
│   ├── mail/            # SMTP
│   ├── schemas/         # Mongoose-схемы
│   └── database/        # подключения, seed
├── frontend/src/
│   ├── app/             # страницы Next.js (App Router)
│   ├── components/      # UI
│   ├── hooks/
│   └── lib/             # api, auth, permissions, help content
├── docs/                # эта документация
├── deploy/              # nginx, UPDATE.md
├── scripts/             # install, update, backup, user guide
└── docker-compose*.yml
```

## Скрипты

| Команда | Где | Что делает |
|---------|-----|------------|
| `npm run start:dev` | backend | Nest watch |
| `npm run build` | backend | `nest build` |
| `npm run dev` | frontend | Next dev |
| `npm run build` | frontend | production build |
| `./scripts/update.sh` | сервер | pull + rebuild compose |
| `python scripts/generate_user_guide.py` | корень | DOCX-инструкция пользователя |

## Тестовые учётки (dev seed)

При `SEED_DEV_DATA=true` (не production по умолчанию):

| Роль | Email | Пароль |
|------|-------|--------|
| Арендатор | tenant@pass24.local | tenant123 |
| Ресепшн | security@pass24.local | security123 |
| Админ БЦ | admin@pass24.local | admin123 |

Супер-админ: `ADMIN_USERNAME` / `ADMIN_PASSWORD` из env (по умолчанию `admin` / см. `.env.example`).

## Полезные точки входа в коде

| Задача | Где смотреть |
|--------|----------------|
| Логин / регистрация / SMS OTP | `backend/src/auth/auth.service.ts` |
| Фильтр пропусков по компании | `backend/src/passes/passes.service.ts` → `buildAccessFilter` |
| Права ролей | `backend/src/access/access.constants.ts` |
| Настройки сайта / FAQ / guide | `backend/src/site-settings/` |
| Клиент API | `frontend/src/lib/api.ts` |
| Контекст авторизации | `frontend/src/lib/auth.tsx` |
| Проверка permissions в UI | `frontend/src/lib/permissions.ts` |
| Плавающая помощь | `frontend/src/components/HelpFaq.tsx` |

## Сборка и типичные ошибки

### Backend TS2345 (FAQ / DTO)

`FaqItemDto.id` опционален — в `SiteSettingsService.update` входные FAQ/guide принимают optional `id` и нормализуются в `normalizeFaqItems` / `normalizeGuideSections`.

### Frontend не ходит в API

Проверьте `NEXT_PUBLIC_API_URL` (должен включать `/api`) и CORS backend.

### SMS не уходит

`SMS_ENABLED=true` + `SMSAERO_*` + в админке включена регистрация по SMS.

### Письма не видны

В Docker письма ловит **Mailpit** (`:8025`). В prod — реальный SMTP.

## Дальше

- Архитектура: [ARCHITECTURE.md](./ARCHITECTURE.md)
- API: [API.md](./API.md)
- Процесс работы: [CONTRIBUTING.md](./CONTRIBUTING.md)
