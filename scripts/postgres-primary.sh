#!/bin/bash
set -euo pipefail

: "${PGDATA:?PGDATA is required}"
: "${PG_REPL_USER:?PG_REPL_USER is required}"
: "${PG_REPL_PASSWORD:?PG_REPL_PASSWORD is required}"
REPLICA_1_HOST="${PG_REPLICA_1_HOST:-postgres_replica}"
REPLICA_2_HOST="${PG_REPLICA_2_HOST:-postgres_replica_2}"
PORT="${PG_PORT:-5432}"

check_remote_is_primary() {
    local host="$1"
    PGPASSWORD="$PG_REPL_PASSWORD" psql -h "$host" -p "$PORT" -U "$PG_REPL_USER" -d "$POSTGRES_DB" -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "error"
}

# If this is an existing database directory, check if another replica was already promoted while we were down
if [ -s "$PGDATA/PG_VERSION" ]; then
    echo "Checking if an active promoted Primary already exists in the cluster..."
    r1_status=$(check_remote_is_primary "$REPLICA_1_HOST")
    r2_status=$(check_remote_is_primary "$REPLICA_2_HOST")

    new_primary=""
    if [ "$r1_status" = "f" ]; then
        new_primary="$REPLICA_1_HOST"
    elif [ "$r2_status" = "f" ]; then
        new_primary="$REPLICA_2_HOST"
    fi

    if [ -n "$new_primary" ]; then
        echo "=================================================================="
        echo "SPLIT-BRAIN PREVENTION: $new_primary is already acting as PRIMARY!"
        echo "Demoting this node (postgres_primary) to STANDBY (Secondary)..."
        echo "=================================================================="

        # Re-initialize or configure as standby following the promoted primary
        rm -rf "${PGDATA:?}"/*
        export PGPASSWORD="$PG_REPL_PASSWORD"
        gosu postgres pg_basebackup --host="$new_primary" --port="$PORT" \
            --username="$PG_REPL_USER" --pgdata="$PGDATA" \
            --wal-method=stream --write-recovery-conf --checkpoint=fast

        escaped_password=${PG_REPL_PASSWORD//\\/\\\\}
        escaped_password=${escaped_password//:/\\:}
        printf '%s:%s:replication:%s:%s\n' "$new_primary" "$PORT" "$PG_REPL_USER" "$escaped_password" > "$PGDATA/.pgpass"
        chown postgres:postgres "$PGDATA/.pgpass"
        chmod 600 "$PGDATA/.pgpass"
        unset PGPASSWORD

        export PGPASSFILE="$PGDATA/.pgpass"
        unset PG_REPL_PASSWORD
        exec docker-entrypoint.sh postgres -c hot_standby=on
    fi
fi

# If no other node has taken over as primary, execute standard postgres entrypoint
echo "No other primary detected. Starting as read-write PRIMARY..."
exec docker-entrypoint.sh postgres -c wal_level=replica -c max_wal_senders=10 -c max_replication_slots=10 -c hot_standby=on
