# Ежедневный / ручной бэкап MongoDB (pass24 + pass24_auth) на Windows.
#
# Использование (PowerShell):
#   cd C:\Users\it\Documents\GitHub\pass24front
#   .\scripts\mongo-backup.ps1
#
# Переменные окружения (опционально):
#   $env:MONGO_CONTAINER = "pass24-mongo"
#   $env:BACKUP_DIR      = "C:\Users\it\Documents\pass24-backups\mongo"
#   $env:RETENTION_DAYS  = "14"
#
# Восстановление (пример):
#   Get-Content .\pass24_YYYYMMDD_HHMMSS.gz -AsByteStream |
#     docker exec -i pass24-mongo mongorestore --archive --gzip --drop --db pass24

$ErrorActionPreference = "Stop"

$Container = if ($env:MONGO_CONTAINER) { $env:MONGO_CONTAINER } else { "pass24-mongo" }
$BackupDir = if ($env:BACKUP_DIR) {
  $env:BACKUP_DIR
} else {
  Join-Path $env:USERPROFILE "Documents\pass24-backups\mongo"
}
$RetentionDays = if ($env:RETENTION_DAYS) { [int]$env:RETENTION_DAYS } else { 14 }
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker не найден. Установите Docker Desktop и убедитесь, что docker в PATH."
}

$running = docker ps --format "{{.Names}}" 2>$null
if (-not ($running -split "`n" | Where-Object { $_.Trim() -eq $Container })) {
  Write-Error "Контейнер Mongo '$Container' не запущен. Запустите: docker compose up -d mongo"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$pass24File = Join-Path $BackupDir "pass24_$Stamp.gz"
$authFile = Join-Path $BackupDir "pass24_auth_$Stamp.gz"

function Invoke-MongoDump {
  param([string]$DbName, [string]$OutFile)
  Write-Host "Бэкап $DbName → $OutFile"
  $proc = Start-Process -FilePath "docker" -ArgumentList @(
    "exec", $Container, "mongodump", "--db", $DbName, "--archive", "--gzip"
  ) -RedirectStandardOutput $OutFile -NoNewWindow -Wait -PassThru
  if ($proc.ExitCode -ne 0) {
    Write-Error "mongodump $DbName failed: exit $($proc.ExitCode)"
  }
  if (-not (Test-Path $OutFile) -or (Get-Item $OutFile).Length -lt 50) {
    Write-Error "Файл бэкапа пустой или слишком маленький: $OutFile"
  }
}

Invoke-MongoDump -DbName "pass24" -OutFile $pass24File
Invoke-MongoDump -DbName "pass24_auth" -OutFile $authFile

# Удаление старых бэкапов
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "pass24_*.gz" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  Remove-Item -Force
Get-ChildItem -Path $BackupDir -Filter "pass24_auth_*.gz" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  Remove-Item -Force

Write-Host "Backup OK:"
Write-Host "  $pass24File ($([math]::Round((Get-Item $pass24File).Length/1KB, 1)) KB)"
Write-Host "  $authFile ($([math]::Round((Get-Item $authFile).Length/1KB, 1)) KB)"
Write-Host "Каталог: $BackupDir (хранение $RetentionDays дней)"
