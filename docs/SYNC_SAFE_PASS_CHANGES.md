# Безопасная доработка Pass под синхронизацию с M-Style

Цель: подготовить `pass24front` к **реалистичному** приёму справочника с сайта
(и опционально к узкому reverse), **не ломая** текущий UI, регистрацию, пропуска
и ручное администрирование.

Связано: `SYNC_USERS_OFFICES.md`, `SYNC_MSTYLE_PROBLEMS.md`, контракт сайта
(`pass-sync-site-schemas.ts`).

---

## 1. Принципы «безопасно»

| Принцип | Что значит на практике |
|---|---|
| **Только additive** | Новые поля/индексы/модуль; не переименовывать и не удалять существующие поля |
| **Sync = отдельный слой** | Не вшивать upsert в `AdminService.createUser` «как есть»; отдельный `SyncModule` |
| **Не трогать auth-секреты** | password, OTP/invite hashes, `lastLoginAt`, `profileChangeRequest` — вне синка |
| **Идемпотентность** | Повтор snapshot/event не плодит дубли и не откатывает локальные секреты |
| **Soft deactivate** | `isActive=false` / unset `tenantId`, не hard-delete (пропуска ссылаются на office/user) |
| **Site master для directory** | Synced поля — patch с сайта; локальные override только с явным флагом |
| **Feature flag** | `SYNC_MSTYLE_ENABLED=false` по умолчанию; prod включается осознанно |
| **Service auth ≠ user JWT** | Ingest только по service token / HMAC, не admin Bearer из браузера |
| **Dry-run** | Режим «показать diff без записи» перед первым полным прогоном |
| **Аудит всего** | Каждое изменение через sync → `AuditService` + run id |

Если правило мешает «быстро залить» — правим процесс, не правило.

---

## 2. Что менять в данных (фазы)

### Фаза 1 — ключи сопоставления (без HTTP синка)

Минимальный фундамент. После этого уже можно писать маппер и тесты.

#### 2.1. `Office` — добавить `externalId` + `sync`

```ts
// office.schema.ts — только добавить, существующие поля не трогать

@Prop({ unique: true, sparse: true, trim: true })
externalId?: string; // "tf-room:107"

@Prop({ type: Object, default: {} })
sync?: {
  sourceSystem?: 'mstyle-wordpress';
  sourceId?: number;
  lastSyncedAt?: Date;
  lastEventId?: string;
  /** true = directory fields управляются сайтом */
  managedBySync?: boolean;
};
```

Индекс: уже unique sparse на `externalId`.  
Старые офисы без `externalId` продолжают жить как `pass-local`.

#### 2.2. `Property` — закрепить `code` + лёгкий `sync`

Уже есть `code` (unique sparse). Конвенция:

```text
code = "tf-business-center:{term_id}"
```

Добавить (additive):

```ts
@Prop({ type: Object, default: {} })
sync?: {
  sourceSystem?: 'mstyle-wordpress';
  sourceId?: number;
  lastSyncedAt?: Date;
  managedBySync?: boolean;
};
```

`address` остаётся **required** в схеме. При синке, если с сайта нет адреса:

```text
address = name  // или "— (из M-Style)"
```

Не ослаблять `required` без миграции всех документов.

#### 2.3. `User` — структурировать `meta`, не размазывать хаос

Сейчас: `meta: Record<string, any>`. Оставить, но **зафиксировать контракт ключей**:

```ts
// meta (конвенция, не обязательно менять тип на class сразу)
{
  externalId: "wp-user:123",           // human
  sourceSystem: "mstyle-wordpress",
  sourceId: 123,
  residentProfileId: 42,               // numeric site id
  residentProfileExternalId: "resident-profile:42",
  managedBySync: true,
  lastSyncedAt: "ISO",
  lastEventId: "...",
  // НЕ класть пароли, токены, PII сверх контракта
}
```

Добавить sparse unique index (рекомендуется):

```ts
UserSchema.index(
  { 'meta.externalId': 1 },
  { unique: true, sparse: true },
);
UserSchema.index(
  { 'meta.residentProfileExternalId': 1 },
  { unique: true, sparse: true },
);
```

**Осторожно:** перед unique index в prod — проверить дубли:

```js
db.users.aggregate([
  { $match: { 'meta.externalId': { $type: 'string' } } },
  { $group: { _id: '$meta.externalId', n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
]);
```

#### 2.4. Новая коллекция `sync_runs` / `sync_processed_events` (в `pass24`)

Не смешивать с users.

| Коллекция | Назначение |
|---|---|
| `sync_runs` | id прогона, direction, status, stats, errors[], dryRun |
| `sync_processed_events` | `eventId` unique — идемпотентность at-least-once |

Это безопаснее, чем «надеемся, что upsert сам разберётся».

---

### Фаза 2 — `SyncModule` (изолированный ingest)

```
backend/src/sync/
  sync.module.ts
  sync.controller.ts      // только service-auth
  sync.service.ts         // оркестрация
  mstyle/
    mstyle-mapper.ts      // DTO сайта → patch Pass
    mstyle-snapshot.dto.ts
    mstyle-event.dto.ts
  guards/
    sync-service.guard.ts // token / HMAC
  sync-protected-fields.ts
```

**Не** вызывать «как пользователь» `createUser` с фейковым password.  
Отдельные методы:

- `upsertPropertyFromSite(...)`
- `upsertOfficeFromSite(...)`
- `upsertTenantFromProfile(...)`
- `upsertEmployeeFromMembership(...)`
- `applyDeactivate(...)`

Внутри — переиспользовать уже существующие приватные куски где безопасно
(`syncTenantProperties` логику), но **не** тащить admin DTO с password.

#### Эндпоинты (черновик)

| Method | Path | Назначение |
|---|---|---|
| `POST` | `/api/sync/mstyle/snapshot` | Полный/partial snapshot |
| `POST` | `/api/sync/mstyle/events` | Пакет событий |
| `POST` | `/api/sync/mstyle/dry-run` | Diff без записи |
| `GET`  | `/api/sync/mstyle/runs/:id` | Статус прогона (service or admin) |

Все под `SYNC_MSTYLE_ENABLED=true` и service guard.  
В Swagger — отдельный tag, **не** светить token в примерах prod.

#### Порядок применения (обязательный)

```text
1. businessCenters → properties
2. offices (без tenantId или tenantId после tenants)
3. residentProfiles → tenant users (role=tenant)
4. owners memberships (link, не дубль)
5. office.tenantId + company + syncTenantProperties
6. employees → tenant_employee + parentTenantId
7. deactivations (isActive / unset tenantId)
```

Нарушение порядка = orphan links и «сотрудник без owner».

---

### Фаза 3 — защита полей и UI

#### 3.1. Whitelist полей, которые sync **имеет право** менять

```ts
// sync-protected-fields.ts — идея

export const USER_SYNC_ALLOW = [
  'fullName', 'firstName', 'lastName', 'middleName',
  'phone', 'email', 'company', 'isActive',
  'role', // только tenant | tenant_employee при создании из синка
  'parentTenantId',
  'properties', 'office', 'floor', // через syncTenantProperties
  'meta.externalId', 'meta.sourceSystem', 'meta.sourceId',
  'meta.residentProfileId', 'meta.residentProfileExternalId',
  'meta.managedBySync', 'meta.lastSyncedAt', 'meta.lastEventId',
  'invitePending', // true при первом create без пароля
] as const;

export const USER_SYNC_NEVER = [
  'password',
  'passwordResetCodeHash', 'passwordResetExpiresAt', 'passwordResetLastSentAt',
  'emailVerifyCodeHash', 'emailVerifyExpiresAt', 'emailVerifyLastSentAt',
  'inviteTokenHash', 'inviteExpiresAt', 'inviteLastSentAt',
  'lastLoginAt',
  'profileChangeRequest',
  'isBlocked', // блок админом Pass — локальный; не затирать с сайта без политики
  'emailVerified', // не ставить true «потому что с сайта»
] as const;

export const OFFICE_SYNC_ALLOW = [
  'number', 'floor', 'areaSqm', 'company', 'tenantId', 'isActive',
  'property', 'externalId', 'sync',
] as const;
```

Реализация: **явный `$set` только allow-полей**, никогда `replaceOne` всего документа.

#### 3.2. Создание user без пароля

При первом upsert tenant/employee с сайта:

```text
password: отсутствует (или random unusable hash, если схема/логин требуют поле)
invitePending: true
isActive: true | false  // по контракту isActive с сайта
emailVerified: false
meta.managedBySync: true
```

Вход:

- существующий invite flow (`acceptInvite`), **или**
- OTP login later,

**не** копировать WP password и **не** ставить `password: 'synced'`.

#### 3.3. Админка / API ручного CRUD

Для сущностей с `managedBySync` / `meta.managedBySync`:

| Действие | Поведение |
|---|---|
| Править `number`, `company`, `phone` directory | **403** или warning + require `?force=1` + audit |
| `isActive` / `isBlocked` | разрешить (operational) |
| Удалить office с пропусками | как сейчас — нельзя hard-delete |
| Создать local user | `meta.source = pass-local`, без externalId |

Так синк остаётся реалистичным: сайт не «воюет» с админом каждую ночь.

---

### Фаза 4 — безопасность HTTP

| Мера | Как |
|---|---|
| Отдельный секрет | `SYNC_MSTYLE_TOKEN` (long random), только server-side на сайте |
| Заголовок | `Authorization: Bearer <token>` **или** `X-Sync-Signature: sha256=...` |
| HMAC body (лучше) | `timestamp + rawBody` → HMAC-SHA256; reject skew > 5 min |
| IP allowlist | `SYNC_MSTYLE_IP_ALLOWLIST` (опционально, за reverse-proxy) |
| Feature flag | без флага — 404 (не 401, меньше разведка) |
| Rate limit | на `/api/sync/*` жёстче, чем на login |
| Payload size | лимит body (например 5–20 MB) + пагинация snapshot |
| Нет CORS для sync | sync дергает server-to-server; не нужен browser origin |
| Логи | не логировать полный snapshot с телефонами в plaintext forever; маскировать PII в error traces |
| Staging | отдельный token; prod token ≠ staging |

Guard — **отдельный** от `JwtAuthGuard` / roles admin.  
Даже `admin` JWT не должен по умолчанию принимать гигантский snapshot «от имени сайта»
(иначе XSS/краденый admin token = полный rewrite directory).

---

### Фаза 5 — dry-run, идемпотентность, деградация

#### Dry-run

```json
POST /api/sync/mstyle/dry-run
→ {
  "wouldCreate": { "properties": 2, "offices": 10, "users": 5 },
  "wouldUpdate": { ... },
  "wouldDeactivate": { ... },
  "conflicts": [
    { "type": "email_collision", "externalId": "wp-user:1", "existingUserId": "..." }
  ],
  "errors": []
}
```

Первый prod-прогон: **только dry-run → разбор conflicts → apply**.

#### Конфликты, которые надо уметь ловить

| Конфликт | Безопасное поведение |
|---|---|
| Email уже у `pass-local` user | **не** затирать; conflict в report; manual link |
| Phone collision | то же |
| Office `property+number` занят другим `externalId` | error, не silent rebind |
| Employee без known owner externalId | skip + error item |
| Multi active memberships (v1) | взять primary rule **или** skip с error |

#### Идемпотентность

- `eventId` в `sync_processed_events` → повтор = 200 no-op  
- upsert по `externalId` / `meta.externalId`  
- deactivate по событию, не delete  

#### Частичный failure

Snapshot apply:

- либо transaction-like **batch per entity type** с run status `partial`,
- либо fail-fast после N errors,

но **не** «половина employees без offices» без `sync_runs.errors[]`.

---

## 3. Чего **не** делать (антипаттерны)

| Антипаттерн | Почему опасно |
|---|---|
| `findOneAndReplace` всего User | сотрёт password/invite |
| Синк через UI admin API с фейковым паролем | дыра в auth, audit врёт |
| Матч офисов только по `number` | коллизии между БЦ |
| Hard-delete user/office из синка | ломает passes / FK-логику |
| Писать в Mongo сайта из Pass | минус ACL темы WP, минус валидации |
| Включить reverse «на всё» в v1 | циклы и конфликты |
| Класть паспорт/secure_payload в `meta` | PII scope creep, compliance |
| Уникальный index без очистки дублей | prod migrate down |
| Синк staff (security/admin) с сайта | их нет в контракте; риск privilege |
| Авто `emailVerified: true` | обход verify-flow |

---

## 4. Миграция существующих данных Pass

Если в prod уже есть БЦ/офисы/арендаторы, заведённые руками:

1. **Не** запускать snapshot apply сразу.
2. Экспорт текущих entities + dry-run.
3. Ручной или semi-auto **linking**:
   - property.name ≈ BC name → set `code` / `sync`
   - office by property+number → set `externalId`
   - user by phone/email → set `meta.externalId` (только exact match)
4. Unmatched site entities → create.
5. Unmatched Pass entities → оставить `pass-local`.
6. Только потом nightly events.

Скрипт linking — read-only report first (`scripts/sync-link-report.ts`), write — отдельной командой с confirm.

---

## 5. Изменения в коде по слоям (минимальный diff-план)

### 5.1. Schemas (низкий риск)

- [ ] `office.schema.ts` — `externalId`, `sync`
- [ ] `property.schema.ts` — `sync` (code уже есть)
- [ ] `user.schema.ts` — indexes на `meta.externalId`, `meta.residentProfileExternalId`
- [ ] новые schemas: `sync-run`, `sync-processed-event`

### 5.2. Config / env

```env
SYNC_MSTYLE_ENABLED=false
SYNC_MSTYLE_TOKEN=
SYNC_MSTYLE_HMAC_SECRET=
SYNC_MSTYLE_IP_ALLOWLIST=
SYNC_MSTYLE_MAX_BODY_BYTES=10485760
SYNC_MSTYLE_DRY_RUN_DEFAULT=true
```

В `app.module` / Config validate: если enabled и нет token → **fail boot** (лучше, чем открытый endpoint).

### 5.3. Module

- [ ] `SyncModule` + guard + service + DTOs (class-validator)
- [ ] audit actions: `sync.snapshot`, `sync.event`, `sync.conflict`
- [ ] unit tests: mapper + «NEVER fields untouched»
- [ ] e2e: snapshot twice → same counts; event replay → no-op

### 5.4. Admin/Auth touchpoints (осторожно)

- [ ] `updateUser` / `updateOffice`: если managedBySync и поле из directory → block/force
- [ ] `createUser` — без изменений для ручного UI
- [ ] login: user без password + invitePending → понятная ошибка («примите приглашение»)

### 5.5. Docs

- [ ] обновить `SYNC_USERS_OFFICES.md` (externalId, порядок, never-fields)
- [ ] `API.md` — секция Sync (service auth)
- [ ] `SYNC_MSTYLE_PROBLEMS.md` — ссылка на этот гайд

---

## 6. Маппинг «сайт → Pass» (кратко, для реализации)

| Site DTO | Pass | Правило |
|---|---|---|
| `SiteBusinessCenterSync` | `Property` | `code=externalId`, `name`, `address=name\|placeholder`, `type=business_center`, `isActive` |
| `SiteOfficeSync` | `Office` | `externalId`, `number`, `floor` stringified, `areaSqm=areaM2`, `property` by BC externalId, `isActive≈isPublished` |
| `SiteResidentProfileSync` | `User` tenant | `meta.residentProfileExternalId`, `company=companyName\|label`, `isActive` |
| `SiteUserSync` + owner membership | тот же / link | `meta.externalId=wp-user:*`, phone, email, fullName |
| `SiteUserSync` + employee | `User` employee | `parentTenantId` → owner user, `role=tenant_employee` |
| profile.officeIds | `Office.tenantId` | только owner; потом `syncTenantProperties` |

`availability: free\|busy` — **не** маппить в `isActive` без бизнес-решения (см. PROBLEMS).

---

## 7. Порядок внедрения (безопасный rollout)

```text
Week / step
1. Schemas + indexes (deploy, no behavior change)
2. SyncModule behind flag=false + unit tests
3. Staging: dry-run against anonymized/site snapshot
4. Staging: apply + ручная проверка login invite + passes
5. Prod: linking report существующих данных
6. Prod: dry-run
7. Prod: flag=true, first snapshot off-peak
8. Events cron/webhook
9. (optional) UI read-only badge «M-Style»
10. (later) reverse whitelist — отдельный ADR
```

Откат:

- `SYNC_MSTYLE_ENABLED=false` — ingest мертв.
- Данные, уже записанные, **не** авто-удалять.
- При катастрофе — restore Mongo backup (уже есть backup scripts в репо).

---

## 8. Критерии «синк реалистичен»

Считаем подготовку достаточной, когда:

1. Повторный snapshot не меняет password/invite и не плодит users.
2. Офисы матчятся по `tf-room:*`, не по голому номеру.
3. Employee всегда с валидным `parentTenantId`.
4. Dry-run показывает conflicts до apply.
5. Managed entities нельзя молча затереть из админки.
6. Service token обязателен; без flag endpoint недоступен.
7. Есть `sync_runs` с ошибками и счётчиками.
8. Local `pass-local` users/offices сосуществуют с synced.

---

## 9. Минимальный MVP vs «красиво»

| MVP (сделать) | Отложить |
|---|---|
| externalId на office, code на property | reverse sync |
| meta.* конвенция + indexes | multi-profile |
| SyncModule snapshot + events + dry-run | availability field |
| never-touch auth fields | SSO с WordPress |
| feature flag + service token | realtime &lt; 1s |
| soft deactivate | hard consistency distributed txs |
| audit + sync_runs | full admin UI for sync conflicts (сначала CSV/report) |

---

## 10. Вывод

Безопасная доработка — это **не** «большой bang rewrite admin», а:

1. **Ключи** (`externalId` / `code` / `meta`) — additive.  
2. **Изолированный SyncModule** с whitelist полей и service auth.  
3. **Политика master=site** + soft deactivate + dry-run.  
4. **Защита** ручного CRUD и auth-полей.  
5. **Rollout** через flag и staging.

После фазы 1–2 синхронизация становится реалистичной технически;  
фаза 3–5 делает её безопасной в production.

Следующий практический шаг в коде: PR только со schema additive fields + indexes +
пустой `SyncModule` + guard (flag off) — zero behavior change для пользователей.
