#!/usr/bin/env python3
"""One-shot remote install helper (run from dev machine)."""
import sys
import time
import paramiko

HOST = "192.168.200.9"
USER = "user"
PASSWORD = "01031964"
INSTALL_CMD = (
    "set -e; "
    "echo '01031964' | sudo -S chown -R user:user /opt/pass24front 2>/dev/null || true; "
    "git config --global --add safe.directory /opt/pass24front; "
    "if [ ! -d /opt/pass24front/.git ]; then "
    "  echo '01031964' | sudo -S mkdir -p /opt; "
    "  git clone --branch main https://github.com/Lugovskoy-Maxim/pass24front.git /opt/pass24front; "
    "fi; "
    "cd /opt/pass24front && git pull origin main; "
    "chmod +x scripts/*.sh; "
    "echo '01031964' | sudo -S env PUBLIC_IP=188.64.164.202 bash scripts/install-server.sh"
)


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    print("Running install (Docker + nginx + deploy, may take 10+ min)...")
    stdin, stdout, stderr = client.exec_command(INSTALL_CMD, get_pty=True)
    stdin.channel.settimeout(900)
    while True:
        if stdout.channel.recv_ready():
            sys.stdout.write(stdout.channel.recv(4096).decode(errors="replace"))
            sys.stdout.flush()
        if stderr.channel.recv_stderr_ready():
            sys.stderr.write(stderr.channel.recv_stderr(4096).decode(errors="replace"))
            sys.stderr.flush()
        if stdout.channel.exit_status_ready():
            break
        time.sleep(0.3)
    code = stdout.channel.recv_exit_status()
    print(f"\nExit code: {code}")
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())