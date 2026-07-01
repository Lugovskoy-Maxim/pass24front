#!/usr/bin/env python3
"""Remote install helper. Usage: SSH_PASSWORD=... python scripts/remote-install.py"""
import os
import sys
import time
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "192.168.200.9")
USER = os.environ.get("DEPLOY_USER", "user")
PASSWORD = os.environ.get("SSH_PASSWORD", "")
PUBLIC_IP = os.environ.get("PUBLIC_IP", "188.64.164.202")

if not PASSWORD:
    print("Set SSH_PASSWORD env var", file=sys.stderr)
    sys.exit(1)

INSTALL_CMD = (
    f"set -e; "
    f"echo '{PASSWORD}' | sudo -S chown -R {USER}:{USER} /opt/pass24front 2>/dev/null || true; "
    f"git config --global --add safe.directory /opt/pass24front; "
    f"if [ ! -d /opt/pass24front/.git ]; then "
    f"  echo '{PASSWORD}' | sudo -S mkdir -p /opt; "
    f"  git clone --branch main https://github.com/Lugovskoy-Maxim/pass24front.git /opt/pass24front; "
    f"fi; "
    f"cd /opt/pass24front && git pull origin main; "
    f"chmod +x scripts/*.sh; "
    f"echo '{PASSWORD}' | sudo -S env PUBLIC_IP={PUBLIC_IP} bash scripts/install-server.sh"
)