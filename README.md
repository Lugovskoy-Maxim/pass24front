# PASS24 БЦ — пропуска для бизнес-центра

Система заказа и контроля пропусков для **бизнес-центров** с офисами в аренду. Аналог pass24.ru, адаптированный под B2B: арендаторы заказывают пропуска для посетителей, курьеров и парковки, ресепшн контролирует вход.

## Функционал

| Роль | Возможности |
|------|-------------|
| **Арендатор** | Заказ пропусков (посетитель, парковка, доставка, подрядчик), указание офиса и цели визита |
| **Ресепшн / Охрана** | Одобрение заявок, панель ресепшн, вход/выход посетителей |
| **Администратор** | Управление арендаторами и офисами, права доступа, аудит, настройки |

### Типы пропусков

- **Посетитель** — встречи, переговоры, собеседования
- **Парковка** — гостевой автомобиль с гос. номером
- **Доставка** — курьеры (можно автоодобрение)
- **Подрядчик** — техническое обслуживание, ремонт

### Жизненный цикл

```
На рассмотрении → Одобрен → В здании → Покинул БЦ
```

## Структура

```
pass24/
├── backend/     # NestJS + MongoDB
├── frontend/    # Next.js + React + Tailwind
├── docker-compose.yml
├── docker-compose.dev.yml
├── backend/Dockerfile
└── frontend/Dockerfile
```

## Быстрый старт

```bash
# Backend
cd backend && npm install && npm run seed && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

Откройте http://localhost:3000

## Запуск через Docker Compose (рекомендуется)

Проще всего запустить весь стек (frontend + backend + MongoDB) одной командой:

```bash
# Обычный запуск (production build)
docker compose up --build

# Или для разработки с hot-reload
docker compose -f docker-compose.dev.yml up --build
```

После запуска:

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/api
- Swagger: http://localhost:4000/api/docs
- MongoDB: localhost:27017

### Монтирование данных MongoDB

Данные MongoDB сохраняются на хосте через bind mount:

- Путь по умолчанию: `./data/mongo`
- Можно переопределить в `.env` файле:

```env
MONGO_DATA_PATH=./my-mongo-data
```

Затем запустите:

```bash
docker compose up --build
```

### Кастомная конфигурация Mongo

- Конфиг: `docker/mongo/mongod.conf` (монтируется в контейнер)
- Init-скрипт: `docker/mongo/init-mongo.js` (создаёт коллекции и индексы при первом запуске)

Чтобы применить изменения в `mongod.conf`, пересоберите:

```bash
docker compose down
docker compose up --build
```

### Полезные команды

```bash
# Сборка и запуск
docker compose up --build

# Запуск в фоне
docker compose up -d

# Остановка и удаление контейнеров
docker compose down

# Удаление вместе с данными Mongo
docker compose down -v

# Смотреть логи Mongo
docker compose logs -f mongo
```

**Примечание**: При использовании `docker-compose.dev.yml` исходный код монтируется в контейнеры, поэтому изменения применяются сразу (hot reload).

### Docker окружение

Скопируйте пример:

```bash
cp docker/.env.example .env
```

Отредактируйте `MONGO_DATA_PATH` при необходимости. Docker Compose автоматически подхватит `.env`.

### Тестовые аккаунты

| Роль | Email | Пароль |
|------|-------|--------|
| Арендатор (ООО «ТехноСофт», оф. 401) | tenant@pass24.local | tenant123 |
| Ресепшн | security@pass24.local | security123 |
| Админ БЦ | admin@pass24.local | admin123 |

## Админ-панель (`/admin`)

- Обзор БЦ: пользователи, пропуска, бизнес-центры
- Арендаторы и сотрудники
- Офисы и права доступа
- Журнал аудита
- Настройки: лимиты, часы работы, этаж ресепшн

## API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | /api/auth/login | Вход |
| POST | /api/passes | Заказ пропуска |
| GET | /api/passes/journal | Журнал ресепшн |
| POST | /api/passes/:id/check-in | Вход в БЦ |
| GET | /api/admin/dashboard | Статистика (admin) |
| GET | /api/admin/business-centers | Список БЦ |