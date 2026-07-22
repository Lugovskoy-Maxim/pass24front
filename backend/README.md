# Backend (NestJS)

API сервиса пропусков PASS24 / M-STYLE.

## Документация

См. корневой каталог **[docs/](../docs/)**:

- [DEVELOPMENT.md](../docs/DEVELOPMENT.md) — запуск и env  
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) — модули и БД  
- [API.md](../docs/API.md) — эндпоинты  

Swagger после старта: `http://127.0.0.1:4000/api/docs`

## Команды

```bash
cp .env.example .env
npm ci
npm run start:dev   # watch
npm run build
npm run start:prod  # node dist/main
```

Глобальный префикс API: `/api`.
