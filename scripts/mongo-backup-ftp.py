#!/usr/bin/env python3
"""Upload Mongo backup .gz files to FTP/FTPS and prune remote copies older than N days.

Filename pattern (date taken from name, not FTP mtime):
  pass24_YYYYMMDD_HHMMSS.gz
  pass24_auth_YYYYMMDD_HHMMSS.gz

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

NAME_RE = re.compile(
    r"^(?:pass24|pass24_auth)_(\d{8})_\d{6}\.gz$",
    re.IGNORECASE,
)


def env_bool(name: str, default: bool = False) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def connect() -> ftplib.FTP:
    host = (os.environ.get("BACKUP_FTP_HOST") or "").strip()
    user = (os.environ.get("BACKUP_FTP_USER") or "").strip()
    password = os.environ.get("BACKUP_FTP_PASS") or ""
    port = int((os.environ.get("BACKUP_FTP_PORT") or "21").strip() or "21")
    if not host or not user:
        raise SystemExit("BACKUP_FTP_HOST and BACKUP_FTP_USER are required")

    if env_bool("BACKUP_FTP_SSL", False):
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
    match = NAME_RE.match(name)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y%m%d")
    except ValueError:
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

    retention = int((os.environ.get("RETENTION_DAYS") or "7").strip() or "7")
    remote_dir = (os.environ.get("BACKUP_FTP_DIR") or "/").strip() or "/"

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
