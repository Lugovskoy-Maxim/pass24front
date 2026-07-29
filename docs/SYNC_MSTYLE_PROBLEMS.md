# M-Style ↔ Pass: синхронизация — проблемы для решения

Документ фиксирует, **возможна ли обратная синхронизация (Pass → сайт)** и какие
вопросы/разрывы нужно закрыть до реализации.

Связанные материалы:

- контракт сайта: `pass-sync-site-data-contract.md`, `pass-sync-site-schemas.ts`
- модель Pass: `docs/SYNC_USERS_OFFICES.md`
- схемы: `backend/src/schemas/{user,office,property}.schema.ts`

Статус: **черновик для согласования** (бизнес + backend сайта + backend Pass).

---

## 1. Краткий ответ: обратная синхронизация возможна?

**Да, но не «зеркально» и не по всем сущностям.**

| Направление | Реалистичность | Комментарий |
|---|---|---|
| **Сайт → Pass** (справочник users/offices/BC) | Высокая | Основной и рекомендуемый путь; DTO уже набросаны |
| **Pass → сайт** (обратная) | Средняя / узкая | Возможна **только для согласованного подмножества полей** и только если сайт принимает write-API |
| Полный bidirectional «оба источника истины» | Низкая без дисциплины | Высокий риск конфликтов и расхождений |

### Почему не зеркало

1. **Разные модели данных**
   - Сайт: WP user + resident profile + membership + `summary_json.resident_offices`.
   - Pass: user (tenant / employee) + `offices.tenantId` + `parentTenantId`.
   - Нет 1:1 сущности «профиль резидента» в Pass.

2. **Разная зона ответственности**
   - Сайт — договоры, реквизиты, CMS-офисы, бронирования, публичный контент.
   - Pass — пропуска, охрана, check-in/out, staff (security / bc_admin / admin).
   - Часть Pass-сущностей **не должна** уезжать на сайт (admin, security, audit, passes).

3. **Пароли и auth**
   - Сайт: WordPress auth (`user_pass`, сессии, OTP/Telegram и т.д.).
   - Pass: bcrypt + invite / email verify / SMS reset.
   - **Пароли в любую сторону не синкаются** (и не должны).

4. **Write-path на сайте сейчас не контрактован**
   - Черновик описывает **сериализацию из WP** (snapshot/events), не API приёма изменений из Pass.
   - Для reverse нужны endpoints/hooks на стороне M-Style (или прямой write в MySQL — нежелательно).

### Практичная формула

```
Source of truth (рекомендация v1):
  сайт  →  резиденты, компании, membership, справочник офисов/БЦ, привязка офис↔резидент
  Pass  →  пропуска, статусы визитов, staff-роли (security/bc_admin), локальные настройки доступа

Обратная синхронизация v1 (если нужна):
  только «операционные» поля, которые сайт готов принять:
  - статус активности арендатора/сотрудника в Pass (блокировка доступа к пропускам)
  - факт «сотрудник добавлен/отключён в Pass» → membership на сайте (опционально)
  - НЕ: создание БЦ/офисов, реквизиты, secure_payload, пароли
```

Полный reverse (создание офисов и компаний из Pass на сайт) **технически возможен**, но это уже
**двусторонний master** с правилами merge — отдельный проект, не «добавить webhook».

---

## 2. Карта сущностей и допустимые направления

| Сущность | Сайт → Pass | Pass → сайт | Примечание |
|---|:---:|:---:|---|
| Бизнес-центр | ✅ | ⚠️ | Reverse только если CMS принимает создание/update `tf_business_center`; address в Pass обязателен, на сайте в DTO нет |
| Офис (tf_room) | ✅ | ⚠️ | Номер не уникален глобально; reverse без `tf-room:{id}` опасен |
| Профиль резидента / компания | ✅ | ⚠️ | В Pass нет отдельной сущности profile — только tenant user + company |
| Участник (owner/employee) | ✅ | ⚠️ | Multi-profile на сайте vs один `parentTenantId` в Pass |
| Активность / блокировка | ✅ | ✅* | *узкий reverse: isActive/isBlocked → is_active membership/profile |
| Staff (security, bc_admin, admin) | — | ❌ | Только Pass |
| Пропуска, журнал, audit | — | ❌ | Только Pass |
| Пароли, сессии, OTP | ❌ | ❌ | Никогда |
| Паспорт, secure_payload, банк | ❌ | ❌ | Вне контракта |
| Переговорные / брони | ❌ | ❌ | Отдельный контракт, если понадобится |

Легенда: ✅ целесообразно · ⚠️ условно / с ограничениями · ❌ не делать

---

## 3. Проблемы для решения (чеклист)

Ниже — блоки, без закрытия которых синк (в любую сторону) будет хрупким.
Приоритет: **P0** — блокер MVP · **P1** — нужно до production · **P2** — улучшения.

### P0. Источник истины и направление

| # | Проблема | Зачем решать | Варианты решения |
|---|---|---|---|
| B1 | Не зафиксировано, **где создают** резидентов, сотрудников, офисы | Без этого любой write — конфликт | A) сайт master, Pass replica · B) Pass master · C) split by entity (рекомендуется A + узкий reverse) |
| B2 | Не ясен scope **обратной** синхронизации | Иначе scope creep и дубли | Явный whitelist полей Pass→сайт; остальное read-only с сайта |
| B3 | Нет политики конфликтов | Двойное редактирование ломает данные | Last-write-wins с `updatedAt` · site-wins · Pass-wins · manual queue |

**Решение, которое нужно утвердить письменно:**

```text
Master: сайт (M-Style) для directory (BC, office, resident, membership).
Pass: consumer + локальный operational state (passes, staff).
Reverse: только [перечислить поля], иначе 409/ignore.
```

---

### P0. Идентичность и ключи сопоставления

| # | Проблема | Детали | Решение |
|---|---|---|---|
| I1 | На сайте нет одной таблицы users/offices | Данные размазаны по WP + custom tables | Синк только через **логические DTO** (`Site*Sync`), не SQL join из Pass |
| I2 | Номер офиса **не уникален** между БЦ | Пример: `2` в Добрынинском и Измайловском | Всегда `externalId`: `tf-room:{ID}`; матч `property + number` — вторичный |
| I3 | В Pass у `Office` **нет** `externalId` / `meta` | Повторный upsert и reverse без стабильного ключа | Добавить `externalId` (или `meta.externalId`) + unique sparse index |
| I4 | У `Property` есть `code`, у `User` — `meta`, форматы не зафиксированы | Разные разработчики запишут по-разному | Конвенция: `wp-user:{id}`, `resident-profile:{id}`, `tf-room:{id}`, `tf-business-center:{id}` + `sourceSystem: mstyle-wordpress` |
| I5 | Две БД Pass (`pass24` / `pass24_auth`) | users и offices в разных URI; join только по ObjectId | Мапа `externalId → ObjectId` в sync-слое (или коллекция `sync_links`) |
| I6 | Пользователь сайта vs профиль резидента | Один human → N profiles; Pass «сжимает» в tenant | Правило: один **primary** active resident-profile на human для MVP; multi-profile — отдельная фаза |

---

### P0. Модельный разрыв User / Profile / Membership

| # | Проблема | Сайт | Pass | Что решить |
|---|---|---|---|---|
| M1 | Нет сущности «профиль» в Pass | `SiteResidentProfileSync` | `User` tenant + `company` + offices | Где хранить `resident-profile:{id}`: `user.meta.residentProfileId` |
| M2 | Multi-membership | user ∈ нескольких profiles | один `parentTenantId` | Запрет multi в v1 **или** N tenant-users на одного human (плохо для UX) **или** redesign Pass |
| M3 | Owner дублируется | `profiles.user_id` + row в `tf_profile_members` | один user без parent | При ingest не создавать двух owners |
| M4 | Офисы на профиле, не на membership | `summary_json.resident_offices` | `offices.tenantId` = owner | Employees **не** получают office rows; доступ через команду owner — уже так в Pass |
| M5 | `origin: guest` | есть на сайте | в DTO excluded | Явно не синкать guest; reverse не создавать guest-профили |

---

### P0. Auth и вход пользователей, пришедших с сайта

| # | Проблема | Почему больно | Решение |
|---|---|---|---|
| A1 | С сайта **нет пароля** | `createUser` в админке требует password | Sync-create: без password, `invitePending: true` + invite link **или** passwordless (SMS/email OTP only) |
| A2 | Email может быть пустым / `@local.invalid` | Unique email в Pass; login по email | Нормализация: null; login по phone; запрет фейковых email |
| A3 | Phone форматы | WP `tf_booking_phone` vs Pass normalize | Единый E.164 / `7…` как на сайте |
| A4 | Два независимых аккаунта | User правит пароль в WP ≠ Pass | Либо SSO/OIDC later, либо явно «два входа» в UX |
| A5 | Reverse создания user на сайте | WP user_pass обязателен / другой lifecycle | Pass→сайт: только metadata/membership, **не** создавать WP-auth без продукта сайта |

---

### P1. Активность, доступ, жизненный цикл

| # | Проблема | Вопрос бизнесу | Предлагаемый default |
|---|---|---|---|
| L1 | Что считается «закрыть доступ в Pass» | Увольнение / блок профиля / конец договора / busy office / кнопка в Pass? | Явная матрица событий → actions |
| L2 | `user.deactivated` vs `profile.deactivated` vs `membership.removed` | Три разных события в контракте | membership.removed → employee isActive=false; profile.deactivated → owner + employees + отвязка offices |
| L3 | Статус офиса `free`/`busy` vs `isActive` | free ≠ выключен | `isPublished=false` или unpublish → office.isActive=false; availability — отдельное поле (сейчас в Pass нет) |
| L4 | Пропуска после отзыва | Гасить active passes? | v1: не трогать историю; option: auto-cancel future |
| L5 | Reverse: блокировка в Pass | Должен ли сайт отражать isBlocked? | Если да — только флаг «pass_access_blocked», не удалять membership |

**Черновик матрицы (утвердить):**

| Событие на сайте | Действие в Pass |
|---|---|
| membership employee removed / is_active=0 | employee `isActive=false` |
| profile is_active=0 | owner `isActive=false`, employees off, `offices.tenantId` unset |
| office unpublish | office `isActive=false` |
| office availability free/busy | informatively only (или игнор) |
| contractEndDate passed | optional job: review binding (не auto без бизнес-правила) |

| Событие в Pass (reverse) | Действие на сайте |
|---|---|
| employee isActive=false (owner выключил) | membership.is_active=0 **если** reverse включён |
| admin blocked user | флаг в usermeta / не трогать WP login |
| создан pass / check-in | **не** синкать на сайт |
| создан security user | **не** синкать |

---

### P1. Поля, которых не хватает одной из сторон

| Поле / тема | Сайт DTO | Pass | Проблема |
|---|---|---|---|
| address БЦ | нет | `Property.address` **required** | При site→Pass нужен placeholder или расширить DTO |
| officeFormat, roomType | есть | нет | Либо `office.meta`, либо игнор |
| areaM2 | есть | `areaSqm` | Простой rename |
| floor | number \| null | string? | Привести тип |
| workplacesMin/Max | есть | нет | meta или игнор |
| contractEndDate | есть | нет | meta / job |
| companyLegalForm, type individual/company | есть | только `company` string | meta на user |
| updatedAt user | часто null | timestamps Mongo | Incremental sync по user хрупкий; нужен changelog на сайте |
| schemaVersion / eventId | в DTO | нет outbox | Нужны для идемпотентности |

---

### P1. API, доставка, безопасность

| # | Проблема | Решение |
|---|---|---|
| S1 | Нет ingest API в Pass | `POST /api/sync/mstyle/snapshot`, `POST /api/sync/mstyle/events` + service token |
| S2 | Нет accept API на сайте для reverse | Явный WP REST / internal endpoint; **не** писать в MySQL из Pass напрямую |
| S3 | Auth между системами | mTLS или HMAC + shared secret + IP allowlist; не user JWT |
| S4 | Идемпотентность | `eventId` unique; upsert by externalId; at-least-once delivery |
| S5 | Порядок применения | BC → offices → profiles/owners → office.tenantId → employees (как `SYNC_USERS_OFFICES.md`) |
| S6 | Объём snapshot | Пагинация / cursor; не один JSON на всё production без лимитов |
| S7 | Наблюдаемость | audit `sync.*`, dead-letter, метрики lag |
| S8 | Окружения | staging site ↔ staging Pass; запрет prod→dev |

---

### P1. Обратная синхронизация — отдельные проблемы

| # | Проблема | Почему | Что нужно |
|---|---|---|---|
| R1 | Сайт не описан как **receiver** | Контракт = export schema | Спека `PassToSite*` DTO + WP handlers |
| R2 | CMS-ограничения | `tf_room` + taxonomies + postmeta | Reverse office update только через те же хелперы темы, что и UI сайта |
| R3 | Валидация «ровно один БЦ» | WP допускает несколько terms | Pass всегда 1 property; reverse не должен плодить multi-BC |
| R4 | Кто побеждает при правке office.number в Pass | Номер мог уехать с сайта | **Запретить** edit synced number в Pass UI **или** site-wins |
| R5 | Создание tenant только в Pass | Регистрация `/auth/register` | Помечать `meta.source = pass-local`; **не** пушить на сайт без флага «create resident on site» |
| R6 | Сотрудники, созданные owner в Pass | `POST /auth/tenant/employees` | Reverse membership — только если бизнес хочет единый HR-контур |
| R7 | Циклические апдейты | site→Pass→site→… | `origin` / `X-Sync-Source` + ignore echo; version vectors |
| R8 | Частичный reverse без full directory | Pass знает не всё (нет secure fields) | Reverse никогда не затирает поля, которых нет в payload (patch, не replace) |

---

### P2. Продукт и UX

| # | Проблема | Решение |
|---|---|---|
| U1 | Два UI правят одних людей | В Pass UI: badge «из M-Style», read-only ключевые поля |
| U2 | Invite vs уже есть WP login | Текст: «вход в Pass по invite / отдельный пароль» |
| U3 | Расхождение company name | Показывать source; site-wins для synced |
| U4 | Админы ждут «как 1С» realtime | SLA: snapshot nightly + events &lt; N минут; не обещать hard realtime без очереди |
| U5 | Multi-office tenant | Уже ок в Pass; UI списка офисов должен показывать все, не один `user.office` |

---

## 4. Рекомендуемые режимы внедрения

### Режим A — только сайт → Pass (MVP)

- Snapshot + events с сайта.
- Pass не пишет на сайт.
- Synced fields в Pass: read-only в админке (или override с warning).
- **Обратной синхронизации нет.**

Подходит, если цель — «резиденты с сайта могут заказывать пропуска».

### Режим B — сайт → Pass + узкий reverse (рекомендуется, если reverse «нужен»)

Сайт → Pass: directory как в режиме A.

Pass → сайт (whitelist), например:

1. `employee.access_revoked` / `employee.access_granted` → `tf_profile_members.is_active`
2. опционально: `tenant.pass_blocked` → usermeta, без удаления профиля

**Не** reverse:

- CRUD офисов/БЦ
- company legal data
- passwords
- passes

### Режим C — полный bidirectional

Только после:

- закрыты B1–B3, I*, M*, R7–R8
- outbox на обеих сторонах
- conflict UI / admin tools
- тесты на циклы и concurrent edits

Оценка: существенно дороже MVP; не стартовать с этого.

---

## 5. Минимальные технические доработки Pass (для любого направления)

| Доработка | Зачем |
|---|---|
| `Office.externalId` (unique sparse) + index | Идемпотентный upsert, reverse key |
| `User.meta.sourceSystem`, `meta.externalId`, `meta.residentProfileId` | Конвенция ключей (частично уже через `meta`) |
| `Property.code` = `tf-business-center:{id}` | Уже есть поле; зафиксировать формат |
| `SyncModule`: snapshot/events ingest, service auth | Приём с сайта |
| Не перетирать password / OTP / invite / profileChangeRequest | Уже в `SYNC_USERS_OFFICES.md` |
| Флаг `meta.syncReadOnly` или policy в admin UI | Не ломать directory руками |
| Коллекция `sync_events` / processed `eventId` | Идемпотентность |
| (Если reverse) outbox `pass_sync_outbox` | Надёжная доставка на сайт |

На стороне сайта (вне этого репо):

- сериализатор по `SITE_SYNC_STORAGE_MAP`
- endpoints snapshot/events **или** push webhook
- (если reverse) accept API + anti-loop

---

## 6. Открытые вопросы бизнесу (без ответа — контракт не финален)

1. Где **создают** резидента/сотрудника/офис в 2026: только сайт, только Pass, оба?
2. Нужна ли **обратная** синхронизация? Если да — **какие 1–3 поля** критичны?
3. Pass — только справочник + заказ пропусков, или **авто** выдача/отзыв доступа при событиях сайта?
4. Какое событие **обязано** закрыть доступ в Pass (матрица L1)?
5. Может ли один человек быть в **нескольких** компаниях-профилях, и должен ли Pass это уметь?
6. Нужны ли в Pass ДР / паспорт / иные PII с сайта?
7. Вход в Pass: отдельный invite/пароль или будущий SSO с сайтом?
8. Допустимо ли расхождение «выключили в Pass, на сайте ещё active» (если reverse нет)?

---

## 7. Предлагаемые решения «по умолчанию» (для согласования)

Пока бизнес не ответил иначе, для проектирования закладываем:

| Тема | Default |
|---|---|
| Master directory | **Сайт** |
| Направление MVP | **Сайт → Pass only** |
| Reverse | **Выключен**; при включении — только activity membership (режим B) |
| Multi-profile | **Не поддерживаем** в v1; берём один active resident profile (owner path) |
| Ключи | `externalId` string + `sourceSystem` |
| Пароли | **Никогда** не синкать |
| Конфликт | **site-wins** для directory; Pass-wins для passes/staff |
| Deactivate profile | owner+employees `isActive=false`, unset `offices.tenantId` |
| Local Pass users (register) | `meta.source=pass-local`, не уезжают на сайт |
| Office number edit | для synced — **read-only** в Pass |

---

## 8. Вывод

| Вопрос | Ответ |
|---|---|
| Обратная синхронизация возможна? | **Да, точечно** (activity / membership), не как полное зеркало |
| Полный Pass → сайт (офисы, компании, CMS)? | **Возможно технически**, но нужен write-контракт сайта, anti-loop, conflict policy — отдельный этап |
| Что делать сейчас? | Закрыть вопросы §6, утвердить defaults §7, реализовать **сайт → Pass** + ключи externalId; reverse — отдельным флагом и whitelist |

После утверждения этого документа имеет смысл:

1. Зафиксировать ADR (Architecture Decision Record) «M-Style is directory master».
2. Расширить схемы Pass (`Office.externalId`, sync module).
3. На сайте — export snapshot/events; reverse accept API — только если выбран режим B/C.
