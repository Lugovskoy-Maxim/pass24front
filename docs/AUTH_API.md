# API: логин и регистрация

Базовый URL: `{API}/api`  
Пример: `https://example.com/api` или `http://localhost:4000/api`

Формат: JSON.  
Авторизация после логина: заголовок `Authorization: Bearer <token>`.

Глобальный prefix: `/api` (см. `main.ts`).

---

## Логин

### `POST /auth/login`

Вход по **username / email / телефону** + пароль.

**Body**

| поле | тип | обяз. | комментарий |
|------|-----|-------|-------------|
| `login` | string | * | логин: email, username или телефон |
| `email` | string | * | то же, что login (для старых клиентов) |
| `password` | string | да | мин. 4 символа |

\* нужен `login` **или** `email`.

```json
{
  "login": "owner@company.ru",
  "password": "secret1"
}
```

**200**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "...",
    "email": "owner@company.ru",
    "full_name": "Иванов Иван",
    "last_name": "Иванов",
    "first_name": "Иван",
    "middle_name": "Иванович",
    "phone": "+79001234567",
    "company": "ООО Пример",
    "role": "tenant",
    "role_label": "Арендатор",
    "office": "401",
    "floor": "4",
    "offices": [],
    "property_ids": [],
    "permissions": ["passes.create", "passes.view_own", "..."],
    "enabledPassTypes": ["visitor", "parking", "delivery", "contractor"],
    "parent_tenant_id": null,
    "is_tenant_owner": true,
    "is_active": true,
    "email_verified": true,
    "profile_change_request": null
  }
}
```

JWT payload: `{ sub: userId, email, role }`.

**Ошибки (обычно 401)**

| сообщение | когда |
|-----------|--------|
| Неверный логин или пароль | нет юзера / неверный пароль |
| Аккаунт ещё не активирован… | `invitePending` (сотрудник не принял invite) |
| Учётная запись отключена владельцем… | сотрудник, `isActive=false` |
| Учётная запись заблокирована | `isBlocked` |

> Владелец-арендатор с `isActive=false` (ждёт одобрения админом) **может** залогиниться — UI решает, что ему показывать.

---

## Регистрация арендатора (2 шага)

Только **новая компания** (`role=tenant`).  
После confirm: `isActive=false` → ждёт апрува админом. **Токена нет** — войти можно, но доступ ограничен до одобрения.

### Схема

```
1) POST /auth/register/request-code  →  OTP на email или SMS
2) POST /auth/register/confirm       →  создаётся user, pendingApproval
3) админ одобряет                    →  isActive=true
4) POST /auth/login
```

### 1. `POST /auth/register/request-code`

Запрос кода. Данные кладутся во временную `registration_pending` (TTL **15 мин**).

**Body**

| поле | тип | обяз. | комментарий |
|------|-----|-------|-------------|
| `password` | string | да | ≥ 6 |
| `passwordConfirm` | string | да | должен совпасть с password |
| `company` | string | да | название компании |
| `lastName` / `firstName` | string | да* | фамилия и имя (или fullName) |
| `middleName` | string | нет | |
| `fullName` | string | нет | если нет last/first |
| `email` | string | ** | для канала email |
| `phone` | string | ** | для канала phone, формат +79… |
| `verificationChannel` | `"email"` \| `"phone"` | нет | иначе угадывается по полям |

\* нужны фамилия+имя (или fullName, из которого разберётся).  
\*\* email или phone в зависимости от канала.

**Email-политика**

- зона **.ru / .рф / .su**
- запрещены публичные домены (gmail, outlook, …) — список в админке `blockedEmailDomains`

**SMS**

- включается в настройках сайта (`smsRegistrationEnabled`)
- rate limit: **1 SMS / 5 мин** на тот же pending

```json
{
  "email": "name@company.ru",
  "password": "secret1",
  "passwordConfirm": "secret1",
  "lastName": "Иванов",
  "firstName": "Иван",
  "middleName": "Иванович",
  "company": "ООО Пример",
  "verificationChannel": "email"
}
```

SMS-вариант:

```json
{
  "phone": "+79001234567",
  "email": "name@company.ru",
  "password": "secret1",
  "passwordConfirm": "secret1",
  "lastName": "Иванов",
  "firstName": "Иван",
  "company": "ООО Пример",
  "verificationChannel": "phone"
}
```

**200**

```json
{
  "verificationRequired": true,
  "verificationChannel": "email",
  "message": "Код подтверждения отправлен на name@company.ru",
  "expiresInMinutes": 15,
  "retryAfterSeconds": 0
}
```

При SMS `retryAfterSeconds` обычно `300`.

**Ошибки (400 / 409)**

- пароли не совпадают  
- нет email/телефона  
- email не проходит политику  
- SMS выключен  
- email/телефон уже занят (409)  
- слишком частый SMS  

---

### 2. `POST /auth/register/confirm`

Подтверждение 6-значным кодом → создание user.

**Body**

| поле | тип | обяз. |
|------|-----|-------|
| `code` | string | да, ровно 6 цифр |
| `email` | string | email **или** phone |
| `phone` | string | |

```json
{
  "email": "name@company.ru",
  "code": "123456"
}
```

**200**

```json
{
  "pendingApproval": true,
  "message": "Заявка отправлена. Доступ будет открыт после подтверждения администратором."
}
```

**Ошибки**

- код не найден / истёк / неверный  
- email/телефон уже занят  

---

## Сброс пароля (email)

### `POST /auth/password-reset/request`

```json
{ "email": "name@company.ru" }
```

**200** — если юзер есть: код на почту (15 мин, resend ≥ 5 мин).  
Если нет — `recoveryChannel: "admin"` + контакты админа (не раскрываем «есть/нет» жёстко, но сообщение явное).

### `POST /auth/password-reset/confirm`

```json
{
  "email": "name@company.ru",
  "code": "123456",
  "password": "newpass1",
  "passwordConfirm": "newpass1"
}
```

---

## Invite сотрудника (не регистрация компании)

Owner создаёт сотрудника в JWT-зоне (`POST /auth/tenant/employees`).  
Сотрудник ходит **без JWT**:

### `GET /auth/invite/:token`

```json
{
  "valid": true,
  "email": "emp@company.ru",
  "full_name": "Петров Пётр",
  "company": "ООО Пример",
  "expires_at": "2026-..."
}
```

### `POST /auth/invite/accept`

```json
{
  "token": "...",
  "password": "secret1",
  "passwordConfirm": "secret1"
}
```

**200:** `{ "message": "...", "email": "..." }` → дальше обычный login.

TTL invite: **72 часа**.

---

## Текущий пользователь

### `GET /auth/me`  
`Authorization: Bearer <token>`

**200:** `{ "user": { ... } }` — тот же shape, что в login (без token).

---

## Коды ответов (общие)

| HTTP | смысл |
|------|--------|
| 200 | ок |
| 400 | валидация / бизнес-ошибка (текст в `message`) |
| 401 | нет/плохой JWT или логин |
| 403 | нет прав |
| 409 | конфликт (email/phone занят) |

Точный формат ошибок — через global exception filter (обычно `{ statusCode, message, … }`).

---

## Быстрый чеклист для клиента

1. Регистрация: `request-code` → `confirm` → ждать админа → `login`  
2. Логин: `POST /auth/login` → сохранить `token` → `Authorization: Bearer …`  
3. Сотрудник: ссылка `/invite/{token}` → `invite/accept` → `login`  
4. Сброс: `password-reset/request` → `confirm` → `login`
