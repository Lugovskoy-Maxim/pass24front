# Users / offices / БЦ — схема для синка

MongoDB, две базы. Схемы в коде: `backend/src/schemas/{user,office,property}.schema.ts`.

## Базы

| БД | env | что лежит |
|----|-----|-----------|
| `pass24` | `MONGODB_URI` | properties, offices, passes, … |
| `pass24_auth` | `MONGODB_AUTH_URI` (если нет — та же хост, БД `pass24_auth`) | users |

Id между базами — просто ObjectId, join'а нет. Для синка нужна своя мапа externalId → наш _id.

## Как связано

```
properties (БЦ)
     ↑
   offices.property
     │
     └── tenantId → users (owner)
                          ↑
                 parentTenantId (сотрудник)

security/bc_admin.properties[] → properties
```

- офис всегда в одном БЦ, номер уникален внутри БЦ
- арендатор = `role=tenant` без parentTenantId
- сотрудник = parentTenantId на owner, офисы на сотрудника не вешаем
- охрана/bc_admin — список БЦ в properties[]

## properties

| поле | что это |
|------|---------|
| name, address | название и адрес |
| type | обычно `business_center` |
| code | код, unique — удобно матчить при синке |
| gates | КПП |
| settings | json настроек |
| isActive | |
| parentProperty | если корпуса |
| admins | users, опционально |

## offices

| поле | что это |
|------|---------|
| property | БЦ |
| number | "401" и т.п., unique вместе с property |
| floor | этаж |
| areaSqm | площадь |
| company | название на табличке |
| tenantId | owner (tenant), может быть пусто |
| isActive | |

Матч при синке: property + number.

## users

### role

| role | кто |
|------|-----|
| tenant | владелец компании |
| tenant_employee | сотрудник |
| security | ресепшн/охрана |
| bc_admin | админ БЦ |
| admin | супер-админ |

### поля

| поле | заметки |
|------|---------|
| email, phone, username | unique sparse |
| fullName / last/first/middle | ФИО |
| emailVerified | |
| password + *CodeHash | не трогать при синке |
| role | см. выше |
| properties | БЦ для staff; у tenant — по его офисам |
| office, floor | копия из offices, для отображения |
| company | |
| meta | клади externalId сюда |
| isActive | |
| invitePending | ждёт пароль по invite |
| parentTenantId | сотрудник → owner |
| profileChangeRequest | заявка на смену профиля |

Не перезаписывать: password, хеши OTP/invite, lastLoginAt, profileChangeRequest.

## Порядок синка

1. properties  
2. users (owners)  
3. offices  
4. security / bc_admin  
5. employees  

## Типовые действия

- привязать офис → set tenantId + company  
- отвязать → unset tenantId  
- выключить → isActive=false  

После смены офисов у tenant у нас ещё дергается syncTenantProperties (обновляет users.properties/office/floor).
