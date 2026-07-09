#!/usr/bin/env bash
# Полная очистка БД pass24 и pass24_auth (пересоздание сида при рестарте backend)
set -euo pipefail

CONTAINER="${MONGO_CONTAINER:-pass24-mongo}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Mongo container '$CONTAINER' is not running" >&2
  exit 1
fi

echo "==> Dropping pass24 and pass24_auth..."
docker exec "$CONTAINER" mongo --quiet --eval '
  db.getSiblingDB("pass24").dropDatabase();
  db.getSiblingDB("pass24_auth").dropDatabase();
  print("Databases dropped");
'

echo "==> Restarting backend to re-seed admin..."
docker restart pass24-backend >/dev/null 2>&1 || true
echo "Done. Admin will be created on backend startup if auth DB is empty."