#!/usr/bin/env bash
set -euo pipefail

MONGO_REPLICA_SET="${MONGO_REPLICA_SET:-rs0}"
MONGO_REPLICA_HOST="${MONGO_REPLICA_HOST:-mongo:27017}"

if [[ ! "$MONGO_REPLICA_SET" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid MONGO_REPLICA_SET" >&2
  exit 1
fi
if [[ ! "$MONGO_REPLICA_HOST" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo "Invalid MONGO_REPLICA_HOST" >&2
  exit 1
fi

echo "Waiting for MongoDB at ${MONGO_REPLICA_HOST}"
mongo_ready=false
for _ in $(seq 1 90); do
  if mongo --host "$MONGO_REPLICA_HOST" --quiet \
    --eval 'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
    mongo_ready=true
    break
  fi
  sleep 1
done

if [[ "$mongo_ready" != "true" ]]; then
  echo "MongoDB did not become reachable" >&2
  exit 1
fi

set +e
mongo --host "$MONGO_REPLICA_HOST" --quiet --eval '
  try {
    var status = rs.status();
    quit(status.ok === 1 ? 0 : 1);
  } catch (error) {
    if (error.code === 94 || error.codeName === "NotYetInitialized") quit(2);
    print(error);
    quit(1);
  }
' >/dev/null
status_code=$?
set -e

case "$status_code" in
  0)
    echo "Replica set is already initialized"
    ;;
  2)
    echo "Initializing replica set ${MONGO_REPLICA_SET}"
    mongo --host "$MONGO_REPLICA_HOST" --quiet --eval "
      var result = rs.initiate({
        _id: '${MONGO_REPLICA_SET}',
        members: [{ _id: 0, host: '${MONGO_REPLICA_HOST}' }]
      });
      if (result.ok !== 1 && result.codeName !== 'AlreadyInitialized') {
        printjson(result);
        quit(1);
      }
    "
    ;;
  *)
    echo "Cannot read replica-set status" >&2
    exit "$status_code"
    ;;
esac

for _ in $(seq 1 90); do
  state="$(mongo --host "$MONGO_REPLICA_HOST" --quiet --eval '
    var hello = db.adminCommand({isMaster:1});
    print((hello.setName || "") + "|" + (hello.ismaster === true ? "true" : "false"));
  ' 2>/dev/null || true)"
  if [[ "$state" == "${MONGO_REPLICA_SET}|true" ]]; then
    echo "Replica set ${MONGO_REPLICA_SET} is PRIMARY"
    exit 0
  fi
  sleep 1
done

echo "Replica set did not elect a PRIMARY" >&2
exit 1
