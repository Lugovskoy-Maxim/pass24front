# TODO: аудит интерфейса и технического долга PASS24 / M-STYLE

Дата аудита: 2026-09-28  
Область: `frontend/` (Next.js 15, React 19, Tailwind 4), пользовательский кабинет, стойка регистрации и админка.

## Как читать список

- **P0** — блокирует безопасность, доступность или основной сценарий; сделать до следующого релиза.
- **P1** — заметно ухудшает ежедневную работу и качество продукта; ближайший спринт.
- **P2** — улучшение качества, скорости и масштабируемости; запланировать после P0/P1.
- **P3** — долгосрочная оптимизация или polish.

## Быстрые факты

- `npm run lint` проходит без ошибок.
- `npx tsc --noEmit` проходит без ошибок.
- В `frontend/package.json` нет unit/e2e тестов и тестового раннера.
- Основной API-клиент (`src/lib/api.ts`) содержит большой монолитный набор типов и endpoint-методов.
- UI поддерживает dark/light темы, мобильную нижнюю навигацию, PWA, роли и permissions; изменения должны проверяться во всех этих режимах.

---

## P0 — критические задачи

### Уже закрыто в текущей итерации

- [x] Устранены все предупреждения `react-hooks/exhaustive-deps` в frontend; загрузчики офисов, пользователей и шаблонов теперь имеют стабильные зависимости.
- [x] `PassDetailModal` получил focus trap, Escape и восстановление фокуса.
- [x] `AdminModal` получил focus trap, Escape, восстановление фокуса и уникальный `aria-labelledby`.
- [x] Добавлен глобальный `prefers-reduced-motion` fallback для анимаций, transitions и smooth scroll.
- [x] PWA service worker теперь precache-ит `/offline.html` и отдаёт offline fallback для навигации при сетевой ошибке.
- [x] Добавлен единый `:focus-visible` стиль и мобильные touch targets минимум 44px для основных icon-only controls и нижней навигации.
- [x] `PassDetailModal` использует уникальный `useId()` для заголовка диалога.
- [x] Production build не зависит от сетевой загрузки Google Fonts: шрифт переведён на системный fallback; `next.config.ts` ограничивает tracing root frontend-проектом.
- [x] `npm run build` успешно собирает все 29 маршрутов frontend.
- [x] Добавлен GitHub Actions quality gate `.github/workflows/quality.yml`: frontend lint/typecheck/build и backend lint/typecheck на PR и push в `main`.
- [x] Backend dependencies восстановлены через `npm ci`: `npm ls` теперь согласован (`mongoose@9.7.2` + `mongodb@7.2.0`), backend lint завершаетcя с warnings без ошибок, production typecheck через `tsconfig.build.json` проходит.
- [x] CI запускает integration tests жизненного цикла бронирований на Ubuntu с фиксированным MongoDB 7.0.24 и кэшированием бинарника; убран старый Windows-only fallback на MongoDB 4.4.29.
- [x] Добавлен типизированный frontend resolver `src/lib/booking-status.ts` для доступности confirm/mark-paid/cancel/edit/resolve-attention и semantic status tone; страница заявок использует его вместо разрозненных проверок.
- [x] Исправлено состояние `awaiting_resolution`: UI больше не предлагает недопустимое подтверждение или фиксацию решения до изменения/отмены заявки; после отмены разрешено закрыть финансовое внимание. Добавлен backend Jest contract spec, импортирующий именно frontend resolver.
- [x] `PageError` переведён на семантические theme-токены вместо светлой red-палитры.
- [x] API transport получил общий 30-секундный timeout и проброс `AbortSignal`; отмена вызывающего кода сохраняется как отмена, timeout нормализуется в network error.
- [x] `useConfig` получил TTL-кэш на 5 минут и in-flight deduplication; параллельные компоненты используют один запрос, а `invalidateConfigCache()` принудительно сбрасывает данные.
- [x] Добавлен App Router Error Boundary `src/app/error.tsx` с безопасным сообщением, retry и возвратом на главную без показа stack trace.
- [x] Quality workflow дополнен `format:check` для frontend и backend перед lint/typecheck/build.
- [x] Frontend приведён к единому Prettier-формату; `npm run format:check`, `npm run lint` и `npm run typecheck` проходят локально после чистой установки dependencies.
- [x] Production isolation dev-login подтверждена: backend `AuthService.getDevAccounts()` возвращает пустой список при `NODE_ENV=production`, frontend отображает быстрые аккаунты только из этого ответа.

### Безопасность и сессия

- [ ] **Убрать долгоживущий JWT из `localStorage`** (`src/lib/auth.tsx`, `src/lib/api.ts`). Перейти на `HttpOnly`, `Secure`, `SameSite` cookie и серверную сессию/refresh rotation. Если миграция поэтапная — ограничить TTL, добавить отзыв токена при logout и обработку 401 с единым refresh/logout flow.
  - Готово, когда XSS не позволяет прочитать access token, старые токены отзываются, а истечение сессии ведёт на `/login?next=...` без циклических редиректов.
- [ ] **Проверить production-изоляцию dev-login** (`login/page.tsx`, `getDevAccounts`). Убедиться, что endpoint и кнопки быстрых учёток недоступны в production build, а не только скрыты визуально.
- [ ] **Добавить CSRF-защиту** после перехода на cookie-сессию для всех mutating endpoint-ов.

### Доступность критических действий

- [x] **Сделать полноценный focus trap для модалок** (`PassDetailModal.tsx`, `AdminModal.tsx`, share/help dialogs): фокус внутрь при открытии, восстановление на trigger после закрытия, Tab/Shift+Tab по циклу, уникальные `aria-labelledby` для нескольких экземпляров. Закрыты `PassDetailModal`, `AdminModal`, Share email dialog и HelpFaq.
- [ ] **Проверить цветовой контраст всех статусов и действий в dark/light теме.** `PageError.tsx` переведён с хардкода на семантические CSS-токены; остаётся полный axe/контрастный аудит остальных экранов.
- [ ] **Увеличить target size интерактивных элементов до 44px** на мобильных: закрытие, theme toggle, notification bell, иконки действий в таблицах. Добавить видимый `:focus-visible` для каждого control.

### Надёжность основных сценариев

- [ ] **Единый обработчик 401/403/network timeout** в `api.ts`: отмена запросов через `AbortController`, таймаут, нормализованная ошибка, повтор только для безопасных GET. Сейчас страницы самостоятельно управляют `loading/error`, что создаёт разное поведение.
- [ ] **Не допускать гонки запросов** в `/passes`, `/history`, `/control`, админских списках: при быстром вводе поиска или смене фильтра старый ответ не должен перезаписывать новый. Добавить request id/AbortController и тест на race condition.
- [ ] **Сохранить состояние фильтров и выбранного пропуска в URL** (частично есть `id`): query schema, back/forward, shareable URL, корректное восстановление после refresh.

---

## P1 — ближайший спринт

### UX основных сценариев

- [ ] **Перепроектировать навигацию для ролей.** Сейчас desktop Header и mobile `MobileNav` используют разные правила active-state (`homePath` исключается только в mobile), а mobile молча обрезает меню `.slice(0, 5)`. Вместо скрытой обрезки показать «Ещё»/bottom sheet и единый resolver маршрутов.
- [ ] **Добавить явные loading/skeleton/error/empty состояния** для каждого списка: passes, history, reception, users, offices, booking/service requests. Empty-state должен объяснять причину и следующий шаг (создать пропуск, снять фильтр, повторить запрос).
- [ ] **Улучшить форму заказа пропуска** (`passes/new`): прогресс/группировка полей, sticky summary перед отправкой, понятное разделение «посетитель / визит / офис / уведомления», inline validation на blur, сохранение черновика и предупреждение при уходе со страницы с изменениями.
- [ ] **Сделать выбор даты и офиса самодокументируемым:** показывать часовой пояс, рабочие часы БЦ, закрытые дни и причину недоступной даты; не полагаться на placeholder.
- [ ] **Добавить подтверждение опасных действий** (отмена, отклонение, checkout, блокировка пользователя) с текстом последствия и обязательным reason там, где это требуется бизнес-правилом.
- [ ] **Покрыть полный жизненный цикл заявок на бронирование** (`/admin/booking-requests`, `BookingEditor.tsx`, `lib/operations.ts`): создание гостевой и резидентской заявки, расчёт quote, проверка доступности, редактирование с `revision`, повтор заявки, перенос, продление, выставление счёта, блокировка временного слота и отмена. Для каждого действия явно показывать доступность, последствия и итоговый статус.
- [ ] **Зафиксировать матрицу статусов бронирования** в UI и API-контракте: `guest_request`, `hold`, `confirmed`, `awaiting_resolution`, `cancelled`, `blocked` (и фактические статусы, возвращаемые backend). Описать допустимые переходы, кто их может выполнять (`bookings.manage`, `bookings.finance`, `resident_hours.adjust`) и какие действия/кнопки доступны в каждом состоянии. Невозможные переходы должны блокироваться до запроса и корректно обрабатываться при race/conflict.
- [ ] **Добавить UX для оплаты и возвратов:** явно разделить payment status и booking status, показывать срок hold, ссылку на счёт/оплату, состояние requisites, сумму/скидку/списание часов и доступный возврат. Перед отменой после оплаты показать расчёт возврата и требовать причину.
- [ ] **Проверить календарь занятости:** timezone, границы рабочего дня, шаг слота, закрытые интервалы, конфликт соседних сегментов, повторную загрузку после create/edit/cancel и понятное состояние «нет доступных слотов».
- [ ] **Для toast-уведомлений добавить очередь, паузу таймера при hover/focus и action-кнопку** («Открыть пропуск», «Повторить»). Критические ошибки дублировать inline в контексте поля/карточки.
- [ ] **Мобильная адаптация таблиц админки:** заменить широкие таблицы на card/list view или горизонтальный scroll с закреплённой первой колонкой; проверить клавиатуру и screen reader.
- [ ] **Печатный билет и QR:** проверить читаемость при высоком zoom, контраст QR на обеих темах, понятное состояние «истёк/отменён», кнопку копирования номера и fallback при offline.

### Доступность и контент

- [ ] Провести аудит axe + keyboard-only для `/login`, `/passes`, `/passes/new`, `/control`, `/profile`, `/admin/*`; исправить heading hierarchy, landmark labels, `aria-describedby` ошибок, label/id и tab semantics.
- [x] Добавлен `prefers-reduced-motion` для pulse, smooth scroll, toast и модальных transition через глобальный CSS fallback.
- [ ] Проверить русский текст: единый словарь «пропуск/посещение/гость», pluralization через `Intl.PluralRules`, единый формат дат/времени и сообщений об ошибках.
- [ ] Пересмотреть глобальный HelpFaq: сделать доступным как dialog с trap, не перекрывать mobile-nav и клавиатуру, добавить поиск по FAQ и ссылку на обращение в поддержку.

### Производительность

- [ ] Разбить крупные admin pages и `api-console-runner.ts` на lazy-loaded feature modules; проверить bundle analyzer и размер initial JS.
- [ ] Заменить `<img>` с отключением `@next/next/no-img-element` на `next/image` там, где источник совместим; для data URI оставить отдельный безопасный компонент с лимитом размера.
- [ ] Добавить кэширование конфигурации и справочников (`useConfig`) с TTL/invalidation; не запрашивать одинаковый config из каждого mounted component.
- [ ] В списках включить виртуализацию только после измерения; минимум — server pagination, debounce поиска 300–500ms и сохранение scroll position.
- [ ] Service worker/PWA: версионировать cache, очищать старые caches, добавить offline page и стратегию для устаревших API-ответов; проверить обновление SW без «залипания» старой версии.

---

## P2 — качество и масштабирование

### Архитектура и код

- [ ] Разделить `src/lib/api.ts` на доменные клиенты (`authApi`, `passesApi`, `adminApi`, `configApi`) и вынести общие transport/error/types. Сгенерировать типы из OpenAPI, если backend Swagger актуален.
- [ ] Ввести единый слой data fetching (например, TanStack Query): cache keys, invalidation после mutations, retry policy, stale state и optimistic updates.
- [ ] Создать дизайн-систему primitives: `Button`, `IconButton`, `Input`, `Select`, `Dialog`, `Badge`, `Alert`, `DataTable`; запретить произвольные цветовые хардкоды через lint/code review.
- [ ] Ввести schema validation ответа API (Zod или backend-generated validators) для критических контрактов: user, pass, office, config.
- [ ] Добавить Error Boundary на route segment и telemetry (Sentry/аналог) с request id, ролью и маршрутом без персональных данных.
- [ ] Убрать точечные `eslint-disable`/raw `<img>` после миграции; завести правило запрета новых исключений без комментария причины.

### Тестирование и CI

- [ ] Добавить unit tests для `form-validation`, `permissions`, `pass-status`, дат/часовых поясов, pluralization и `safeNextPath`.
- [ ] Добавить component tests для FormField, PassDetailModal, Header/MobileNav, HelpFaq и тем.
- [ ] Добавить Playwright smoke: login, создание пропуска, поиск/фильтр, check-in/out, admin permission denial, ticket URL, mobile viewport.
- [ ] Добавить Playwright/API smoke для бронирований: создание заявки guest/resident, quote и availability, успешное подтверждение, отмена до и после оплаты, редактирование с актуальной и устаревшей `revision` (ожидаемый conflict), transfer, extend, repeat, блокировка слота, invoice и возврат часов. Проверять обновление списка, detail/history, work-queue count, toast и deep link `?id=`.
- [ ] Добавить негативные тесты заявок: недоступный слот, пересечение сегментов, просроченный `hold`, неполные реквизиты гостя, недостаток квоты часов, отсутствие `bookings.manage`/`bookings.finance`, повторная отправка одинакового `Idempotency-Key`, двойной click по action и отмена уже отменённой заявки. Зафиксировать ожидаемые HTTP-коды и пользовательские сообщения.
- [ ] Добавить контрактные тесты статусов: backend transition matrix ↔ frontend action resolver, чтобы добавление нового статуса не приводило к скрытым кнопкам или неверному цвету badge.

> Локальный integration suite всё ещё нельзя подтвердить на этой Windows-среде без MongoDB binary: загрузка `fastdl.mongodb.org` блокируется `EACCES`. CI job выше загружает бинарник на hosted Ubuntu и кэширует его; успешный результат будет подтверждён статусом workflow после push/PR.
- [ ] В CI запускать `format:check`, `lint`, `tsc --noEmit`, unit/e2e smoke и production build; добавить coverage threshold для критических lib.
- [ ] Добавить visual regression для light/dark и 360/768/1440 px на ключевых страницах.

### Наблюдаемость и операционные сценарии

- [ ] Стандартизировать correlation/request id между frontend и backend; показывать пользователю короткий код ошибки, а не сырые детали.
- [ ] Добавить метрики: время загрузки списка, error rate, доля повторных запросов, конверсия login → created pass, отказ формы по полям, PWA install/notification opt-in.
- [ ] Документировать матрицу ролей × permissions × маршрутов и автоматически проверять её в тестах.
- [ ] Добавить миграционный checklist для API contract changes и feature flags с owner/expiry date.

---

## P3 — точки роста продукта

- [ ] **Dashboard по задачам:** pending approvals, overdue guests, сегодняшние визиты, квота часов, быстрые действия по роли.
- [ ] **Массовые операции:** импорт гостей CSV, bulk approve/reject, повторный заказ по шаблону, экспорт с сохранёнными фильтрами.
- [ ] **Умные шаблоны:** недавние посетители, автозаполнение номера телефона/машины, командные шаблоны с правами доступа и сроком действия.
- [ ] **События и уведомления:** центр уведомлений с read/unread, digest для владельца, push/email preferences, аудит отправки.
- [ ] **Интеграционные UX-сценарии:** deep links из уведомлений, QR scanner для охраны, offline queue для стойки при кратком обрыве сети.
- [ ] **Персонализация бренда:** preview темы/логотипа в админке, проверка контраста загруженного цвета, безопасная очистка SVG и ограничение размера logo.
- [ ] **Поиск и аналитика:** глобальный поиск по номеру пропуска/гостю/офису, сохранённые представления, экспорт отчётов по ролям.

---

## Рекомендуемый порядок на 3 итерации

1. **Итерация 1 (безопасность и база):** cookie-сессия/401 flow, focus trap, dark-theme errors, abort/race protection, CI с typecheck и smoke.
2. **Итерация 2 (ежедневная работа):** форма нового пропуска, mobile/admin tables, loading/empty states, URL filters, подтверждения destructive actions, axe audit.
3. **Итерация 3 (масштабирование):** доменное разбиение API, data-fetching layer, дизайн-система, observability, PWA cache strategy, dashboard и массовые операции.

## Definition of Done для каждого пункта

- Есть issue с owner, affected routes и приоритетом.
- Описаны acceptance criteria и негативные сценарии.
- Добавлен тест или ручной сценарий, который воспроизводит проблему.
- Проверены light/dark, mobile/desktop, keyboard и роли, которых касается изменение.
- Изменение прошло lint/typecheck/build; для UX-критичных задач приложен screenshot или Playwright trace.
