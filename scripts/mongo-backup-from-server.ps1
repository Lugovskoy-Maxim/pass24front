# Скачать бэкапы MongoDB с Linux-сервера на этот Windows-ПК.
#
# Требуется: OpenSSH client (ssh/scp), доступ к серверу.
#
# Пример:
#   .\scripts\mongo-backup-from-server.ps1 -Server "user@192.168.200.9"
#
# Сначала на сервере можно создать свежий dump:
#   ssh user@host "cd /opt/pass24front && sudo ./scripts/mongo-backup.sh"
# затем этот скрипт заберёт файлы.

param(
  [Parameter(Mandatory = $true)]
  [string]$Server,

  [string]$RemoteBackupDir = "/opt/pass24front/backups/mongo",

  [string]$LocalBackupDir = (Join-Path $env:USERPROFILE "Documents\pass24-backups\from-server"),

  # Если true — перед scp запускает mongo-backup.sh на сервере
  [switch]$RunRemoteBackupFirst
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
  Write-Error "scp не найден. Установите OpenSSH Client (Параметры Windows → Приложения → Дополнительные компоненты)."
}

New-Item -ItemType Directory -Force -Path $LocalBackupDir | Out-Null

if ($RunRemoteBackupFirst) {
  Write-Host "Создание бэкапа на сервере..."
  ssh $Server "cd /opt/pass24front && sudo ./scripts/mongo-backup.sh"
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dest = Join-Path $LocalBackupDir $stamp
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "Копирование $Server`:$RemoteBackupDir → $dest"
# Берём последние дампы (scp всех *.gz)
scp "${Server}:${RemoteBackupDir}/pass24_*.gz" "$dest/"
scp "${Server}:${RemoteBackupDir}/pass24_auth_*.gz" "$dest/"

Write-Host "Готово. Файлы в: $dest"
Get-ChildItem $dest | Format-Table Name, Length, LastWriteTime
