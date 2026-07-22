# Вклад в проект (для команды)

## Ветки

- **`main`** — единственная продакшен-ветка (см. `deploy/UPDATE.md`).
- Фичи/фиксы: короткие ветки `feat/…`, `fix/…` или прямые коммиты в `main`, если так принято у команды.

## Перед коммитом

1. **Backend**
   ```bash
   cd backend && npm run build
   ```
2. **Frontend** (по возможности)
   ```bash
   cd frontend && npm run build
   ```
3. Не коммитьте локальный мусор: `node_modules/`, `.env` с секретами, `*.tsbuildinfo` (если не нужен).  
   `backend/dist/` может присутствовать в истории — для Docker-сборки он **пересобирается** в образе; предпочтительно не раздувать PR сгенерированным dist без необходимости.

## Сообщения коммитов

Стиль, уже используемый в репозитории:

```
feat(scope): short description

Optional body: why / impact.
```

Примеры scope: `auth`, `passes`, `help`, `admin`, `build`, `ui`.

## Чеклист по типам изменений

### Auth / SMS / mail

- [ ] Rate limits (SMS 5 мин) не сломаны  
- [ ] Сообщения об ошибках понятны пользователю  
- [ ] Env-переменные описаны в `.env.example`  
- [ ] Audit log для чувствительных действий  

### Пропуска / права

- [ ] `buildAccessFilter` / `ensurePassAccess` учитывают owner **и** employees  
- [ ] Permissions согласованы с `access.constants.ts` и UI  
- [ ] Tenant company list — не только `createdBy = self`  

### Сотрудники арендатора

- [ ] Owner-only endpoints  
- [ ] Disable блокирует login + JWT  
- [ ] Delete переназначает passes на owner  

### FAQ / инструкции

- [ ] Дефолты в `faq-defaults.ts` / `guide-defaults.ts`  
- [ ] DTO optional `id` + normalize  
- [ ] Public `GET /config` отдаёт новые поля  
- [ ] Админка `/admin/site`  

### UI

- [ ] Светлая/тёмная тема (CSS variables)  
- [ ] Mobile + bottom nav не перекрывают FAB/help  
- [ ] `getErrorMessage` для toast  

## Документация

При изменении поведения обновляйте:

| Изменение | Файлы |
|-----------|--------|
| Запуск / env | `docs/DEVELOPMENT.md`, `.env.example` |
| Архитектура / роли | `docs/ARCHITECTURE.md` |
| API | `docs/API.md`, при желании Swagger decorators |
| Пользовательский сценарий | `scripts/generate_user_guide.py` → DOCX |

Индекс: [docs/README.md](./README.md).

## Деплой

После merge в `main` на сервере:

```bash
cd /opt/pass24front && ./scripts/update.sh
```

Подробности: [deploy/UPDATE.md](../deploy/UPDATE.md).

Если Docker build падает на `nest build` — сначала `npm run build` локально в `backend/` и проверьте, что `git pull` на сервере получил последний commit.

## Code review (минимум)

- Нет секретов в git  
- Нет регрессии доступа (tenant vs employee vs admin)  
- Ошибки TypeScript не «заглушены» `@ts-ignore` без причины  
- Миграции схемы Mongo: обычно soft (новые поля optional + defaults); breaking changes — описать в PR  

## Контакты продукта

Сайт prod: настройки `sitePhone` / `siteEmail` в app_settings (админка «Базовые настройки»).
