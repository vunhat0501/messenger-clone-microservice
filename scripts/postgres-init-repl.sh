#!/bin/bash
set -euo pipefail

: "${PG_REPL_USER:?PG_REPL_USER is required}"
: "${PG_REPL_PASSWORD:?PG_REPL_PASSWORD is required}"
[[ "$PG_REPL_USER" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo 'Invalid replication username' >&2; exit 1; }

# psql quotes identifiers and literals independently, including passwords with quotes.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --set=repl_user="$PG_REPL_USER" --set=repl_password="$PG_REPL_PASSWORD" <<'EOSQL'
CREATE USER :"repl_user" WITH REPLICATION LOGIN ENCRYPTED PASSWORD :'repl_password';
SELECT pg_create_physical_replication_slot('auth_replica');
EOSQL

# The image's default host rule does not permit physical replication connections.
printf '\nhost replication %s all scram-sha-256\n' "$PG_REPL_USER" >> "$PGDATA/pg_hba.conf"
