#!/usr/bin/env python3
"""Upload Mongo backup .gz files to FTP/FTPS and prune remote copies older than N days.

Filename pattern (date taken from name, not FTP mtime):
  pass24_YYYY-MM-DD_HH-MM-SS.gz
  pass24_auth_YYYY-MM-DD_HH-MM-SS.gz
  (legacy: pass24_YYYYMMDD_HHMMSS.gz)

Env:
  BACKUP_FTP_HOST (required)
  BACKUP_FTP_USER (required)
  BACKUP_FTP_PASS (required)
  BACKUP_FTP_PORT=21
  BACKUP_FTP_DIR=/ or /pass24-backups
  BACKUP_FTP_SSL=false|true   # FTPS (explicit TLS)
  BACKUP_FTP_PASSIVE=true
  RETENTION_DAYS=7
"""

from __future__ import annotations

import ftplib
import os
import re
import ssl
import sys
from datetime import datetime, timedelta
from pathlib import Path

NAME_RES = (
    re.compile(
        r"^(?:pass24|pass24_auth)_(\d{4}-\d{2}-\d{2})_\d{2}-\d{2}-\d{2}(?:_\d+)?\.gz$",
        re.IGNORECASE,
    ),
    re.compile(
        r"^(?:pass24|pass24_auth)_(\d{8})_\d{6}(?:_\d+)?\.gz$",
        re.IGNORECASE,
    ),
)


def env_str(name: str, default: str = "") -> str:
    raw = os.environ.get(name)
    if raw is None:
        return default
    raw = raw.strip().strip("\r")
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in ('"', "'"):
        raw = raw[1:-1]
    return raw


def env_bool(name: str, default: bool = False) -> bool:
    raw = env_str(name).lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def connect() -> ftplib.FTP:
    host = env_str("BACKUP_FTP_HOST")
    user = env_str("BACKUP_FTP_USER")
    password = env_str("BACKUP_FTP_PASS")
    port = int(env_str("BACKUP_FTP_PORT", "21") or "21")
    use_ssl = env_bool("BACKUP_FTP_SSL", False)
    if not host or not user:
        raise SystemExit("BACKUP_FTP_HOST and BACKUP_FTP_USER are required")

    try:
        if use_ssl:
            context = ssl.create_default_context()
            if env_bool("BACKUP_FTP_INSECURE_SSL", False):
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
            ftp: ftplib.FTP = ftplib.FTP_TLS(context=context)
            ftp.connect(host, port, timeout=60)
            ftp.login(user, password)
            ftp.prot_p()
        else:
            ftp = ftplib.FTP()
            ftp.connect(host, port, timeout=60)
            ftp.login(user, password)
    except ftplib.error_perm as exc:
        raise SystemExit(
            f"FTP login failed ({exc}). Host={host} user={user} port={port} "
            f"ssl={str(use_ssl).lower()}. Check BACKUP_FTP_USER/PASS in .env "
            "(quotes, spaces, Windows CRLF). Do not paste the password here."
        ) from exc

    if env_bool("BACKUP_FTP_PASSIVE", True):
        ftp.set_pasv(True)
    return ftp


def ensure_dir(ftp: ftplib.FTP, remote_dir: str) -> None:
    remote_dir = remote_dir.strip() or "/"
    if remote_dir in ("/", ""):
        ftp.cwd("/")
        return
    # Absolute path preferred
    if not remote_dir.startswith("/"):
        remote_dir = "/" + remote_dir
    parts = [p for p in remote_dir.split("/") if p]
    ftp.cwd("/")
    for part in parts:
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            ftp.mkd(part)
            ftp.cwd(part)


def upload(ftp: ftplib.FTP, local_path: Path) -> None:
    with local_path.open("rb") as fh:
        ftp.storbinary(f"STOR {local_path.name}", fh)
    print(f"FTP uploaded: {local_path.name}")


def list_names(ftp: ftplib.FTP) -> list[str]:
    try:
        return sorted(ftp.nlst())
    except ftplib.error_perm as exc:
        # Empty directory often returns 550
        if "550" in str(exc):
            return []
        raise


def stamp_from_name(name: str) -> datetime | None:
    for pattern in NAME_RES:
        match = pattern.match(name)
        if not match:
            continue
        day = match.group(1).replace("-", "")
        try:
            return datetime.strptime(day, "%Y%m%d")
        except ValueError:
            return None
    return None


def prune(ftp: ftplib.FTP, retention_days: int) -> int:
    cutoff = datetime.now().replace(
        hour=0, minute=0, second=0, microsecond=0
    ) - timedelta(days=retention_days)
    removed = 0
    for name in list_names(ftp):
        base = Path(name).name
        stamped = stamp_from_name(base)
        if stamped is None:
            continue
        if stamped < cutoff:
            try:
                ftp.delete(base)
                print(f"FTP deleted (>{retention_days}d): {base}")
                removed += 1
            except ftplib.error_perm as exc:
                print(f"FTP delete failed for {base}: {exc}", file=sys.stderr)
    return removed


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(
            "Usage: mongo-backup-ftp.py <file1.gz> [file2.gz ...]",
            file=sys.stderr,
        )
        return 2

    files = [Path(p) for p in argv[1:]]
    for path in files:
        if not path.is_file() or path.stat().st_size < 50:
            print(f"Refusing to upload missing/tiny file: {path}", file=sys.stderr)
            return 1

    retention = int(env_str("RETENTION_DAYS", "7") or "7")
    remote_dir = env_str("BACKUP_FTP_DIR", "/") or "/"

    ftp = connect()
    try:
        ensure_dir(ftp, remote_dir)
        for path in files:
            upload(ftp, path)
        # After uploading "day 8", drop remote copies older than 7 days
        removed = prune(ftp, retention)
        print(f"FTP prune done: removed {removed}, retention={retention}d, dir={remote_dir}")
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
