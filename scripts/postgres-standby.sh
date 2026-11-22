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
# Note: do not check ourselves ($HOSTNAME), only remote candidates!
active_primary=""
for candidate in postgres_primary postgres_replica postgres_replica_2; do
    if [ "$candidate" != "$HOSTNAME" ] && [ "$(check_remote_is_primary "$candidate")" = "f" ]; then
        active_primary="$candidate"
        break
    fi
done

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

# If this node was promoted to Primary and no other node is Primary, start it as Primary!
if [ ! -f "$PGDATA/standby.signal" ]; then
    if [ "$active_primary" = "$HOSTNAME" ] || [ "$active_primary" = "error" ] || [ -z "$active_primary" ]; then
        echo "This node was promoted to PRIMARY and no other remote primary exists. Starting as PRIMARY..."
        exec docker-entrypoint.sh postgres -c wal_level=replica -c max_wal_senders=10 -c max_replication_slots=10 -c hot_standby=on
    else
        echo "=================================================================="
        echo "RE-DEMOTION: Node has no standby.signal, but $active_primary is the active PRIMARY."
        echo "Re-synchronizing cleanly from $active_primary as STANDBY..."
        echo "=================================================================="
        rm -rf "${PGDATA:?}"/*
        export PGPASSWORD="$PG_REPL_PASSWORD"

        SLOT_OPT=""
        if [ -n "$SLOT_NAME" ]; then
            SLOT_OPT="--slot=$SLOT_NAME"
        fi

        gosu postgres pg_basebackup --host="$active_primary" --port="$PRIMARY_PORT" \
            --username="$PG_REPL_USER" --pgdata="$PGDATA" \
            --wal-method=stream --write-recovery-conf --checkpoint=fast $SLOT_OPT

        escaped_password=${PG_REPL_PASSWORD//\\/\\\\}
        escaped_password=${escaped_password//:/\\:}
        printf '%s:%s:replication:%s:%s\n' "$active_primary" "$PRIMARY_PORT" "$PG_REPL_USER" "$escaped_password" > "$PGDATA/.pgpass"
        chown postgres:postgres "$PGDATA/.pgpass"
        chmod 600 "$PGDATA/.pgpass"
        unset PGPASSWORD
    fi
fi
export PGPASSFILE="$PGDATA/.pgpass"
unset PG_REPL_PASSWORD
exec docker-entrypoint.sh postgres -c hot_standby=on
