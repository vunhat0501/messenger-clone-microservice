#!/bin/bash
set -euo pipefail

: "${PGDATA:?PGDATA is required}"
: "${PG_REPL_USER:?PG_REPL_USER is required}"
: "${PG_REPL_PASSWORD:?PG_REPL_PASSWORD is required}"

mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"

SLOT_NAME="${PG_REPL_SLOT:-auth_replica}"
PRIMARY_HOST="${PG_PRIMARY_HOST:-postgres_primary}"
PRIMARY_PORT="${PG_PRIMARY_PORT:-5432}"

check_remote_is_primary() {
    local host="$1"
    PGPASSWORD="$PG_REPL_PASSWORD" psql -h "$host" -p "$PRIMARY_PORT" -U "$PG_REPL_USER" -d "${POSTGRES_DB:-postgres}" -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "error"
}

# Dynamically locate which host is currently the read-write PRIMARY
active_primary="$PRIMARY_HOST"
if [ "$(check_remote_is_primary "$active_primary")" != "f" ]; then
    for candidate in postgres_primary postgres_replica postgres_replica_2; do
        if [ "$(check_remote_is_primary "$candidate")" = "f" ]; then
            active_primary="$candidate"
            break
        fi
    done
fi

# If PGDATA is empty OR if timeline diverged, resync cleanly from active primary
if [ ! -s "$PGDATA/PG_VERSION" ]; then
    needs_sync=1
else
    needs_sync=0
fi

if [ "$needs_sync" -eq 1 ]; then
    rm -rf "${PGDATA:?}"/*
    staging=$(mktemp -d "${PGDATA}.backup.XXXXXX")
    chown postgres:postgres "$staging"
    trap 'rm -rf -- "$staging"' EXIT
    export PGPASSWORD="$PG_REPL_PASSWORD"

    SLOT_OPT=""
    if [ -n "$SLOT_NAME" ]; then
        SLOT_OPT="--slot=$SLOT_NAME"
    fi

    gosu postgres pg_basebackup --host="$active_primary" --port="$PRIMARY_PORT" \
        --username="$PG_REPL_USER" --pgdata="$staging" \
        --wal-method=stream --write-recovery-conf --checkpoint=fast $SLOT_OPT

    escaped_password=${PG_REPL_PASSWORD//\\/\\\\}
    escaped_password=${escaped_password//:/\\:}
    printf '%s:%s:replication:%s:%s\n' "$active_primary" "$PRIMARY_PORT" "$PG_REPL_USER" "$escaped_password" > "$staging/.pgpass"
    chown postgres:postgres "$staging/.pgpass"
    chmod 600 "$staging/.pgpass"
    shopt -s dotglob
    mv "$staging"/* "$PGDATA"/
    rmdir "$staging"
    trap - EXIT
    unset PGPASSWORD
fi

# Never silently start an existing primary data directory as a standby.
if [ ! -f "$PGDATA/standby.signal" ]; then
    echo 'Refusing to start: this data directory is not a PostgreSQL standby.' >&2
    exit 1
fi
export PGPASSFILE="$PGDATA/.pgpass"
unset PG_REPL_PASSWORD
exec docker-entrypoint.sh postgres -c hot_standby=on
