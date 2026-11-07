#!/bin/bash
set -euo pipefail

: "${PGDATA:?PGDATA is required}"
: "${PG_REPL_USER:?PG_REPL_USER is required}"
: "${PG_REPL_PASSWORD:?PG_REPL_PASSWORD is required}"

mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
    # Use a fresh staging directory so interrupted backups cannot poison PGDATA.
    staging=$(mktemp -d "${PGDATA}.backup.XXXXXX")
    chown postgres:postgres "$staging"
    trap 'rm -rf -- "$staging"' EXIT
    export PGPASSWORD="$PG_REPL_PASSWORD"
    gosu postgres pg_basebackup --host=postgres_primary --port=5432 \
        --username="$PG_REPL_USER" --pgdata="$staging" \
        --wal-method=stream --write-recovery-conf --checkpoint=fast --slot=auth_replica
    # Persist the replication password in a postgres-only passfile, not command arguments.
    escaped_password=${PG_REPL_PASSWORD//\\/\\\\}
    escaped_password=${escaped_password//:/\\:}
    printf 'postgres_primary:5432:replication:%s:%s\n' "$PG_REPL_USER" "$escaped_password" > "$staging/.pgpass"
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
