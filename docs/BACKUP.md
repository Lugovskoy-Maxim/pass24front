# Бэкапы MongoDB

В системе **две** базы:

| БД | Содержимое |
|----|------------|
| `pass24` | Пропуска, офисы, audit, app_settings |
| `pass24_auth` | Пользователи, registration_pending |

Обе нужно бэкапить вместе.

---

## Вариант A. Mongo крутится на **этом** Windows-ПК (Docker)

### Разовый бэкап

```powershell
cd C:\Users\it\Documents\GitHub\pass24front
.\scripts\mongo-backup.ps1
```

Файлы по умолчанию:

```
C:\Users\it\Documents\pass24-backups\mongo\
  pass24_YYYYMMDD_HHMMSS.gz
  pass24_auth_YYYYMMDD_HHMMSS.gz
```

Другой каталог:

```powershell
$env:BACKUP_DIR = "D:\Backups\pass24"
.\scripts\mongo-backup.ps1
```

Имя контейнера (если не `pass24-mongo`):

```powershell
$env:MONGO_CONTAINER = "pass24-mongo"
docker ps   # проверить имя
```

### Автоматически каждый день (Планировщик заданий)

1. `Win + R` → `taskschd.msc`
2. **Создать задачу…**
3. Триггер: ежедневно, например 02:00
4. Действие:
   - Программа: `powershell.exe`
   - Аргументы:
     ```
     -NoProfile -ExecutionPolicy Bypass -File "C:\Users\it\Documents\GitHub\pass24front\scripts\mongo-backup.ps1"
     ```
5. Условие: «Выполнять, только если компьютер подключён к сети» — по желанию  
6. Docker Desktop должен быть запущен к моменту бэкапа (можно поставить отложенный старт или запускать compose в автозагрузке).

Старые файлы старше **14 дней** скрипт удаляет сам (`RETENTION_DAYS`).

### Восстановление с Windows

```powershell
# Внимание: --drop удалит текущие данные в БД!
Get-Content "C:\Users\it\Documents\pass24-backups\mongo\pass24_20260722_020000.gz" -AsByteStream |
  docker exec -i pass24-mongo mongorestore --archive --gzip --drop --db pass24

Get-Content "C:\Users\it\Documents\pass24-backups\mongo\pass24_auth_20260722_020000.gz" -AsByteStream |
  docker exec -i pass24-mongo mongorestore --archive --gzip --drop --db pass24_auth
```

Если `-AsByteStream` недоступен в вашей PowerShell:

```powershell
cmd /c "type pass24_....gz | docker exec -i pass24-mongo mongorestore --archive --gzip --drop --db pass24"
```

---

## Вариант B. База на **сервере** (Linux), копии на **этот** ПК

На сервере уже есть:

- `scripts/mongo-backup.sh` — dump в `/opt/pass24front/backups/mongo`
- `scripts/setup-mongo-backup-cron.sh` — cron каждый день в 02:00

### 1. Бэкап на сервере (если cron ещё не стоит)

```bash
ssh user@ВАШ_СЕРВЕР
cd /opt/pass24front
sudo chmod +x scripts/mongo-backup.sh scripts/setup-mongo-backup-cron.sh
sudo ./scripts/setup-mongo-backup-cron.sh   # один раз
sudo ./scripts/mongo-backup.sh              # сразу сейчас
ls -la backups/mongo/
```

### 2. Скачать на Windows

```powershell
cd C:\Users\it\Documents\GitHub\pass24front

# Только скачать уже сделанные бэкапы
.\scripts\mongo-backup-from-server.ps1 -Server "user@192.168.200.9"

# Сначала сделать dump на сервере, потом скачать
.\scripts\mongo-backup-from-server.ps1 -Server "user@192.168.200.9" -RunRemoteBackupFirst
```

Куда кладётся:

```
C:\Users\it\Documents\pass24-backups\from-server\YYYYMMDD_HHMMSS\
```

Нужен **OpenSSH Client** (обычно уже есть в Windows 10/11) и доступ `ssh user@host` без ошибок.

### 3. Автоскачивание с сервера (Планировщик)

Действие:

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\it\Documents\GitHub\pass24front\scripts\mongo-backup-from-server.ps1" -Server "user@192.168.200.9" -RunRemoteBackupFirst
```

Рекомендуется вход по **SSH-ключу** без пароля, иначе задание «зависнет» на вводе пароля.

---

## Что выбрать

| Ситуация | Что делать |
|----------|------------|
| Dev-стек на этом ПК | `mongo-backup.ps1` + планировщик |
| Прод на Linux, хочу копии дома | cron на сервере + `mongo-backup-from-server.ps1` |
| Только прод, ПК не нужен | только `mongo-backup.sh` + cron на сервере |

---

## Проверка

1. После бэкапа файлы `.gz` не нулевого размера (обычно десятки KB–MB).  
2. Раз в месяц проверьте restore на **тестовом** контейнере Mongo, не на проде.  
3. Храните копии не только на том же диске, где Docker volume (флешка / другой диск / облако).

---

## Связанные файлы

| Файл | ОС |
|------|-----|
| `scripts/mongo-backup.sh` | Linux (сервер / WSL) |
| `scripts/setup-mongo-backup-cron.sh` | Linux cron |
| `scripts/mongo-backup.ps1` | Windows, локальный Docker |
| `scripts/mongo-backup-from-server.ps1` | Windows ← scp с сервера |
