# Проверка PASS V2, 7 сентября 2026

Сервер: https://pass.mstyle.ru. Токены и приватные ключи в отчёт не включены.

## Подтверждённые результаты

- OAuth RS256: `mstyle-backend-prod` получает HTTP 200 для
  `mstyle.resident.authenticate` и `mstyle.residents.read`.
- `mstyle-reconcile-prod` получает HTTP 200 для `mstyle.changes.read`;
  чтение `/api/internal/integrations/mstyle/v2/changes` возвращает HTTP 200.
- Остальные 15 скоупов из `scripts/check-mstyle-oauth.js` для backend-клиента
  отклонены с HTTP 400 `invalid_scope`. Это проверка разрешений OAuth,
  а не результат выполнения закрытых ими бизнес-операций.
- `scripts/check-mstyle-v2-smoke.js` не смог выполнить операции профилей,
  участников и гостей из-за отсутствующих скоупов. Тестовые записи не созданы.
  Скрипт также запрашивает changes.read у backend-клиента; в текущей конфигурации
  для чтения изменений используется reconcile-клиент, проверенный отдельно.
- Запрос SMS-кода после обновления настроек вернул 202; пользователь подтвердил
  доставку SMS. Полный безопасный вход ещё требует повторной проверки после исправления ниже.
- Email-запрос вернул 202, но сервер записал `no eligible identity`.
  Письмо не отправлялось: для введённого email не найдена подходящая учётная запись.
- Telegram-запрос вернул 202 и имя `m_style_office_bot`; доставка и проверка контакта
  на боевом сервере не подтверждены.

## Исправления, пока только локально

1. SMS Aero `mobile-id/status`: только статус 1 означает успешную авторизацию.
   Статус 3 означает необходимость ввода OTP. Прежняя проверка `1 || 3` приводила
   к преждевременному завершению входа без ввода SMS-кода.
2. Успешный HTTP-ответ `mobile-id/verify` сам по себе не завершает вход:
   проверяется финальный статус провайдера.
3. Обновление challenge из `dispatch_pending` в `awaiting_code` теперь ожидается
   через `await`, включая повторную отправку. Ранее создавался невыполненный запрос Mongoose.

Официальная таблица статусов: https://smsaero.ru/integration/documentation/api/#api_14

Проверка локально: 161 тест, 13 наборов; сборка backend успешна.

## Что требуется на сервере

Для email V2 используется общий `MailService` и текущие `SMTP_*` PASS:
`SMTP_USER=pass@mstyle.ru`, `SMTP_FROM="Пропуск.М-Стиль <pass@mstyle.ru>"`.
Отдельный SMTP V2 не требуется. Проверьте email и статус тестового арендатора в админке;
не снимайте проверку существования/активности пользователя ради отправки письма.

Для остальных сценариев V2 у backend-клиента должны быть разрешены существующие
скоупы интеграции, например в серверном `.env`:

```dotenv
MSTYLE_CLIENT_SCOPES="mstyle.resident.authenticate mstyle.residents.read mstyle.residents.write mstyle.profiles.read mstyle.profiles.write mstyle.memberships.read mstyle.memberships.write mstyle.contacts.read mstyle.contacts.write mstyle.consents.read mstyle.consents.write mstyle.private-data.read mstyle.private-data.write mstyle.guests.read mstyle.guests.write mstyle.admin.search"
```

`mstyle.changes.read` остаётся у reconcile-клиента. Новые имена скоупов не вводились.
После изменения `.env` пересоздайте backend; после установки исправлений запросите
новые challenge и проверьте, что SMS-статус не становится `consumed` до подтверждения.
