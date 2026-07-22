# Архитектура

## Обзор

```
┌─────────────┐     JWT      ┌──────────────────┐
│  Next.js    │ ──────────►  │  NestJS /api     │
│  frontend   │ ◄──────────  │                  │
└─────────────┘   JSON       └────────┬─────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                                   ▼
            MongoDB: pass24                    MongoDB: pass24_auth
         (операционные данные)                  (identity / users)
         · passes, offices                      · users
         · properties, audit                    · registration_pending
         · app_settings, access_config
```

Две URI:

- `MONGODB_URI` → `pass24`
- `MONGODB_AUTH_URI` → `pass24_auth` (по умолчанию та же хост, другая БД)

Это разделение упрощает будущую интеграцию identity (например Bitrix24) без смешивания с операционными коллекциями.

## Backend-модули (NestJS)

| Модуль | Ответственность |
|--------|-----------------|
| `AuthModule` | Login, регистрация (email/SMS), сброс пароля, подтверждение email, сотрудники арендатора |
| `PassesModule` | CRUD/жизненный цикл пропусков, CSV, public ticket, шаблоны |
| `AdminModule` | Пользователи, офисы, БЦ, audit, site-settings (через сервис) |
| `AccessConfigModule` | Роли, permissions, enabled pass types |
| `SiteSettingsModule` | Бренд, SMS-тексты, FAQ, инструкции помощи |
| `MailModule` / `SmsModule` | SMTP и SMS Aero (`@Global`) |
| `AuditModule` | Журнал действий |
| `DatabaseModule` | Подключения Mongoose + seed |

Глобальный префикс: **`/api`**.  
Валидация: `ValidationPipe` (whitelist, transform, forbidNonWhitelisted).  
Документация: Swagger `/api/docs`.

## Frontend (Next.js App Router)

- Страницы: `frontend/src/app/**`
- Клиент API: `lib/api.ts` (Bearer из `localStorage` key `pass24_token`)
- Auth: `lib/auth.tsx` → `AuthProvider`
- Права UI: `lib/permissions.ts` + `ProtectedLayout`
- Публичный конфиг (бренд, FAQ, guide): `GET /config` → `useConfig()`
- PWA: `manifest`, service worker, install prompt

Маршруты (основные):

| Путь | Роль / назначение |
|------|-------------------|
| `/login` | Вход, регистрация, сброс пароля |
| `/passes`, `/passes/new` | Список и заказ пропусков |
| `/control` | Ресепшн |
| `/profile` | Профиль, сотрудники компании |
| `/admin/*` | Админка (panel permissions) |
| `/ticket/[passNumber]` | Публичный электронный пропуск |

## Роли и права

Системные роли (`SYSTEM_ROLES`):

| Роль | Назначение |
|------|------------|
| `tenant` | Владелец компании-арендатора |
| `tenant_employee` (и кастомные) | Сотрудник арендатора (`parentTenantId` → owner) |
| `security` | Ресепшн / охрана |
| `bc_admin` | Админ бизнес-центра |
| `admin` | Супер-админ |

Permissions задаются в `access.constants.ts` и могут переопределяться в админке («Права и типы пропусков»).

### Арендатор и сотрудники

- `parentTenantId` отсутствует → **владелец** компании.
- `parentTenantId` = `_id` владельца → **сотрудник**.
- Офисы привязаны к `tenantId` владельца.
- Список пропусков компании: все `createdBy` в команде владельца (owner + employees).  
  Реализация: `PassesService.getTenantTeamIds` + `buildAccessFilter`.
- **Приглашение сотрудника (без пароля от owner):**
  1. Owner POST `/auth/tenant/employees` (ФИО + email) → user `invitePending=true`, `isActive=false`
  2. Email со ссылкой `/invite/{token}` (TTL **72 ч**, SHA-256 hash в `inviteTokenHash`)
  3. Сотрудник POST `/auth/invite/accept` → пароль, `isActive=true`, invite сброшен
  4. Resend: POST `/auth/tenant/employees/:id/resend-invite` (не чаще 1/5 мин)
- Владелец: включает/отключает (после активации) / удаляет (`PATCH`/`DELETE`).
- При удалении сотрудника его пропуска переназначаются владельцу.

## Жизненный цикл пропуска

Типичный поток (упрощённо; авто-одобрение возможно для delivery):

```
create → approved → (check-in) active / in building → checked out / completed
                 ↘ rejected / cancelled / expired
```

Статусы хранятся в `pass.status`. Ресепшн меняет вход/выход через permissions `passes.reception`.

Публичный ticket: `GET` public controller по номеру пропуска + QR на frontend.

## Регистрация и OTP

1. `POST /auth/register/request-code` — pending в `registration_pending` (codeHash, password hash, TTL 15 мин).
2. Канал `email` → SMTP; `phone` → SMS Aero (rate limit **1 SMS / 5 мин**).
3. `POST /auth/register/confirm` — создаёт `User` с `isActive: false` (ждёт админа).
4. Админ подтверждает арендатора → `isActive: true` + офисы.

Дополнительно:

- Сброс пароля: `/auth/password-reset/*`
- Подтверждение email из профиля: `/auth/email/verify/*`
- `emailVerified` — флаг на пользователе

## Настройки сайта (app_settings)

Коллекция `app_settings`, key=`global`:

- Бренд, цвета, контакты, UI labels
- SMS registration toggle + текст SMS
- `faqItems` — Q&A для кнопки «Помощь»
- `helpGuideSections` — инструкции (title, steps[], paragraphs[])

Публично: `GET /api/config`.  
Редактирование: админка `/admin/site` (permission `admin.settings`).

Дефолты кода: `site-settings/faq-defaults.ts`, `guide-defaults.ts`, `brand/brand-defaults.ts`.

## Аутентификация

- JWT в `Authorization: Bearer <token>`
- Payload: `sub` (userId), `email`, `role`
- `JwtStrategy` подгружает user; отклоняет отключённых сотрудников и `isBlocked`

## Аудит

`AuditService.log({ action, entityType, entityId, actor, details })` — события user/pass/settings.

## Деплой

См. [deploy/UPDATE.md](../deploy/UPDATE.md):

- compose: `docker-compose.yml` + `docker-compose.prod.yml`
- nginx SSL-конфиги в `deploy/nginx/`
- скрипт `scripts/update.sh` на сервере

## Расширение системы

| Цель | Рекомендация |
|------|----------------|
| Новый permission | `access.constants.ts` + UI permissions admin + guard usage |
| Новая роль сотрудника | Админка «Права» (не system role) |
| Новый тип пропуска | `ALL_PASS_TYPES` + labels + forms frontend |
| Новый канал уведомлений | Сервис рядом с `mail`/`sms`, вызов из auth/passes |
| Интеграция Bitrix | Поля `bitrix24*` на User, auth DB уже отдельная |

## Диаграмма ролей (упрощённо)

```
admin ──────────────────────── полный доступ
bc_admin ── users/offices/settings БЦ
security ── journal / check-in-out
tenant (owner) ── passes company + employees
  └── tenant_employee ── passes company (shared list)
```
