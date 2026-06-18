# PASS24 — система заказа и контроля пропусков

Аналог [pass24.ru](https://pass24.ru) для жилых комплексов: заказ гостевых пропусков жителями и контроль на КПП охраной.

## Функционал

- **Жители** — регистрация, заказ пропусков (гость, автомобиль, доставка, служба), отслеживание статуса
- **Охрана** — одобрение/отклонение заявок, журнал КПП, въезд/выезд гостей
- **Администратор** — полный доступ ко всем функциям

### Жизненный цикл заявки

```
pending → approved → active → completed
         ↘ rejected
```

## Структура проекта

```
pass24/
├── backend/     # Node.js + Express + SQLite API
└── frontend/    # Next.js + React + Tailwind CSS
```

## Быстрый старт

### Backend

```bash
cd backend
npm install
npm run seed    # тестовые пользователи и заявки
npm run dev     # http://localhost:4000
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000
```

### Тестовые аккаунты

| Роль      | Email                    | Пароль       |
|-----------|--------------------------|--------------|
| Житель    | resident@pass24.local    | resident123  |
| Охрана    | security@pass24.local    | security123  |
| Админ     | admin@pass24.local       | admin123     |

## API

| Метод  | Endpoint                    | Описание              |
|--------|-----------------------------|-----------------------|
| POST   | /api/auth/login             | Вход                  |
| POST   | /api/auth/register          | Регистрация жителя    |
| GET    | /api/passes                 | Список заявок         |
| POST   | /api/passes                 | Создать заявку        |
| PATCH  | /api/passes/:id/status      | Одобрить/отклонить    |
| POST   | /api/passes/:id/check-in    | Въезд на территорию   |
| POST   | /api/passes/:id/check-out   | Выезд                 |
| GET    | /api/passes/journal         | Журнал КПП            |

## Переменные окружения

**backend/.env**
```
PORT=4000
JWT_SECRET=your-secret
CORS_ORIGIN=http://localhost:3000
```

**frontend/.env.local**
```
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```