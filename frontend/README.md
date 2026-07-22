# Frontend (Next.js)

UI портала пропусков PASS24 / M-STYLE.

## Документация

См. **[docs/](../docs/)** в корне репозитория (запуск, архитектура, API).

## Команды

```bash
echo NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api > .env.local
npm ci
npm run dev
npm run build
```

`NEXT_PUBLIC_API_URL` должен включать суффикс `/api`.
