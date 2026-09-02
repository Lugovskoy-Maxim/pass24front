# Ежедневный / ручной бэкап MongoDB (pass24 + pass24_auth) на Windows.
# Опционально: выгрузка на FTP и prune старше RETENTION_DAYS (по умолчанию 7).
#
# Использование (PowerShell):
#   cd C:\Users\it\Documents\GitHub\pass24front
#   .\scripts\mongo-backup.ps1
#
# Переменные окружения (опционально):
#   $env:MONGO_CONTAINER = "pass24-mongo"
#   $env:BACKUP_DIR      = "C:\Users\it\Documents\pass24-backups\mongo"
#   $env:RETENTION_DAYS  = "7"
#   $env:BACKUP_FTP_ENABLED = "true"
#   $env:BACKUP_FTP_HOST / USER / PASS / DIR / PORT / SSL
#
# Восстановление (пример):
#   Get-Content .\pass24_YYYYMMDD_HHMMSS.gz -AsByteStream |
#     docker exec -i pass24-mongo mongorestore --archive --gzip --drop --db pass24

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

$Container = if ($env:MONGO_CONTAINER) { $env:MONGO_CONTAINER } else { "pass24-mongo" }
$BackupDir = if ($env:BACKUP_DIR) {
  $env:BACKUP_DIR
} else {
  Join-Path $env:USERPROFILE "Documents\pass24-backups\mongo"
}
$RetentionDays = if ($env:RETENTION_DAYS) { [int]$env:RETENTION_DAYS } else { 7 }
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$FtpScript = Join-Path $ScriptDir "mongo-backup-ftp.py"

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

# Локально: дата из имени pass24_YYYYMMDD_HHMMSS.gz (как на FTP)
$cutoffDay = (Get-Date).Date.AddDays(-$RetentionDays).ToString("yyyyMMdd")
Get-ChildItem -Path $BackupDir -Filter "pass24*.gz" -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Name -match '^(pass24|pass24_auth)_(\d{8})_\d{6}\.gz$') {
    if ($Matches[2] -lt $cutoffDay) {
      Write-Host "Local deleted (>${RetentionDays}d): $($_.Name)"
      Remove-Item -Force $_.FullName
    }
  }
}

Write-Host "Backup OK (local, retention $RetentionDays days):"
Write-Host "  $pass24File ($([math]::Round((Get-Item $pass24File).Length/1KB, 1)) KB)"
Write-Host "  $authFile ($([math]::Round((Get-Item $authFile).Length/1KB, 1)) KB)"

$ftpEnabled = ($env:BACKUP_FTP_ENABLED + "").Trim().ToLowerInvariant()
if ($ftpEnabled -in @("true", "1", "yes", "on")) {
  if (-not $env:BACKUP_FTP_HOST -or -not $env:BACKUP_FTP_USER) {
    Write-Error "BACKUP_FTP_ENABLED=true, но не заданы BACKUP_FTP_HOST / BACKUP_FTP_USER"
  }
  $python = $null
  foreach ($candidate in @("python", "python3", "py")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) { $python = $cmd.Source; break }
  }
  if (-not $python) {
    Write-Error "Для FTP нужен Python 3 (python / python3 / py в PATH)"
  }
  $env:RETENTION_DAYS = "$RetentionDays"
  & $python $FtpScript $pass24File $authFile
  if ($LASTEXITCODE -ne 0) {
    Write-Error "FTP upload failed (exit $LASTEXITCODE)"
  }
  Write-Host "Backup OK (FTP upload + remote prune ${RetentionDays}d)"
} else {
  Write-Host "FTP skipped (set BACKUP_FTP_ENABLED=true to upload)"
}

Write-Host "Каталог: $BackupDir"
