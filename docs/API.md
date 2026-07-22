# API (краткий справочник)

Базовый URL: **`/api`**  
Swagger: **`/api/docs`**

Авторизация (кроме public/auth login/register): заголовок

```http
Authorization: Bearer <jwt>
```

Ответы ошибок Nest: `{ statusCode, message, error }`.  
Валидация DTO: 400 с массивом или строкой `message`.

---

## Auth

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/login` | Вход: `{ login\|email, password }` → `{ user, token }` |
| POST | `/auth/register/request-code` | Старт регистрации + OTP |
| POST | `/auth/register/confirm` | Подтверждение кода регистрации |
| POST | `/auth/password-reset/request` | Код сброса пароля на email |
| POST | `/auth/password-reset/confirm` | Новый пароль по коду |
| GET | `/auth/me` | Текущий пользователь |
| PATCH | `/auth/profile` | Заявка на смену профиля (tenant owner) |
| DELETE | `/auth/profile/request` | Отмена заявки профиля |
| POST | `/auth/email/verify/request` | Код подтверждения email |
| POST | `/auth/email/verify/confirm` | `{ code }` |
| GET | `/auth/tenant/employees` | Список сотрудников (owner) |
| POST | `/auth/tenant/employees` | Добавить сотрудника |
| PATCH | `/auth/tenant/employees/:id` | `{ isActive: boolean }` вкл/выкл |
| DELETE | `/auth/tenant/employees/:id` | Удалить; пропуска → owner |
| GET | `/auth/tenant/employee-roles` | Назначаемые роли |
| GET | `/auth/dev-accounts` | Dev quick-login (не production) |

### Регистрация — тело request-code

```json
{
  "email": "a@b.ru",
  "phone": "+79001234567",
  "verificationChannel": "email",
  "password": "secret1",
  "passwordConfirm": "secret1",
  "lastName": "Иванов",
  "firstName": "Иван",
  "company": "ООО Ромашка"
}
```

SMS: не чаще 1 раза в 5 минут на номер.

---

## Config (public)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/config` | Бренд, контакты, `faqItems`, `helpGuideSections`, sms flags, uiLabels, БЦ |

Используется frontend без JWT.

---

## Passes

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/passes` | Список (`status`, `date`, `search`, `limit`, `offset`) |
| POST | `/passes` | Создать пропуск |
| GET | `/passes/:id` | Детали |
| PATCH | `/passes/:id/status` | Смена статуса / check-in-out |
| … | export / report / templates | См. controllers в `passes/` |

**Видимость для компании:** owner и сотрудники видят пропуска всех членов команды (`createdBy` ∈ team).

Public ticket (без JWT, отдельный controller):

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/passes/public/...` | Публичные данные билета по номеру |

Точные пути — в Swagger и `passes-public.controller.ts`.

---

## Admin

Требуют permissions (`admin.panel` + конкретные).

| Область | Примеры |
|---------|---------|
| Users | list, create, approve registration, profile change |
| Offices / BC | CRUD, CSV import/export |
| Access config | roles, permissions, pass types |
| Site settings | GET/PATCH `/admin/site-settings` |
| Audit | journal + export |

### Site settings (фрагмент)

```http
PATCH /api/admin/site-settings
```

```json
{
  "siteName": "M-STYLE",
  "faqItems": [{ "id": "…", "question": "…", "answer": "…" }],
  "helpGuideSections": [{
    "id": "order-pass",
    "title": "Заказ пропуска",
    "steps": ["Шаг 1", "Шаг 2"],
    "paragraphs": ["Пояснение"]
  }]
}
```

SMS-поля (`smsRegistration*`) меняет только роль `admin`.

---

## Пользователь в ответах (фрагмент)

```json
{
  "id": "…",
  "email": "…",
  "email_verified": true,
  "full_name": "…",
  "role": "tenant",
  "parent_tenant_id": null,
  "is_tenant_owner": true,
  "is_active": true,
  "permissions": ["passes.create", "passes.view_own"],
  "offices": []
}
```

---

## Клиент (frontend)

Все вызовы — `frontend/src/lib/api.ts`.  
Ошибки: `ApiError` / `getErrorMessage` в `api-errors.ts`.

При добавлении endpoint:

1. Backend controller + DTO  
2. Метод в `api.ts`  
3. UI / hooks  
4. При необходимости permission + audit log  
