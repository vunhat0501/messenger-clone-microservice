#!/bin/bash
# Start-up script shared by every PostgreSQL node (primary or standby).
#
# A node never decides its role from its service name. On each start it looks for
# the read-write primary among its peers and then:
#   - empty data directory      -> clone from that primary, or initialise a new
#                                  cluster when this is the bootstrap node and no
#                                  primary exists yet;
#   - data with standby.signal  -> start as a standby following that primary;
#   - data without the signal   -> this node used to be a primary. If a peer with a
#                                  newer or equal timeline is primary, the local copy
#                                  is stale (another node was promoted meanwhile):
#                                  discard it and re-clone as a standby. Otherwise
#                                  start as primary.
# The sentinel fences a node by shutting it down; `restart: always` then brings it
# back through this script, which turns a stale primary into a standby.
set -euo pipefail

: "${PGDATA:?PGDATA is required}"
: "${PG_REPL_USER:?PG_REPL_USER is required}"
: "${PG_REPL_PASSWORD:?PG_REPL_PASSWORD is required}"
: "${PG_NODE_NAME:?PG_NODE_NAME is required}"

PORT="${PG_PORT:-5432}"
PEERS="${PG_PEERS:-postgres_primary postgres_replica postgres_replica_2}"
SLOT_NAME="${PG_REPL_SLOT:-}"
BOOTSTRAP_PRIMARY="${PG_BOOTSTRAP_PRIMARY:-false}"
PRIMARY_WAIT_SEC="${PG_PRIMARY_WAIT_SEC:-60}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-3}"

[[ "$PG_REPL_USER" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo 'Invalid replication username' >&2; exit 1; }
[[ -z "$SLOT_NAME" || "$SLOT_NAME" =~ ^[a-z0-9_]+$ ]] || { echo 'Invalid replication slot name' >&2; exit 1; }

SERVER_OPTS=(
    -c wal_level=replica
    -c max_wal_senders=10
    -c max_replication_slots=10
    -c hot_standby=on
    # Inactive slots of a dead standby must not fill the primary's disk.
    -c "max_slot_wal_keep_size=${PG_MAX_SLOT_WAL_KEEP_SIZE:-1GB}"
    # Detect a silently lost primary (network partition) sooner than the 60 s default,
    # so the sentinel's "no standby is still streaming" check can pass.
    -c "wal_receiver_timeout=${PG_WAL_RECEIVER_TIMEOUT:-15s}"
)

log() { echo "[$(date -u +%FT%TZ)] [$PG_NODE_NAME] $*"; }

peer_sql() {
    PGPASSWORD="$PG_REPL_PASSWORD" psql -h "$1" -p "$PORT" -U "$PG_REPL_USER" \
        -d "${POSTGRES_DB:-postgres}" -tAc "$2" 2>/dev/null
}

peer_timeline() {
    PGPASSWORD="$PG_REPL_PASSWORD" psql \
        "host=$1 port=$PORT user=$PG_REPL_USER dbname=replication replication=true" \
        -tA -c IDENTIFY_SYSTEM 2>/dev/null | cut -d'|' -f2
}

local_timeline() {
    gosu postgres pg_controldata "$PGDATA" 2>/dev/null |
        awk -F: '/Latest checkpoint.s TimeLineID/ { gsub(/ /, "", $2); print $2 }'
}

# Prints "<host> <timeline>" of the read-write peer with the highest timeline, or nothing.
find_primary() {
    local best="" best_tl=-1 host tl
    for host in $PEERS; do
        [ "$host" = "$PG_NODE_NAME" ] && continue
        [ "$(peer_sql "$host" 'SELECT pg_is_in_recovery();' || true)" = "f" ] || continue
        tl=$(peer_timeline "$host" || true)
        [[ "$tl" =~ ^[0-9]+$ ]] || tl=0
        if [ "$tl" -gt "$best_tl" ]; then
            best="$host"
            best_tl="$tl"
        fi
    done
    [ -n "$best" ] && echo "$best $best_tl"
    return 0
}

write_pgpass() {
    local escaped=${PG_REPL_PASSWORD//\\/\\\\}
    escaped=${escaped//:/\\:}
    # Wildcard host: the sentinel can repoint this standby to any peer without
    # writing the password into postgresql.auto.conf.
    printf '*:%s:*:%s:%s\n' "$PORT" "$PG_REPL_USER" "$escaped" > "$PGDATA/.pgpass"
    chown postgres:postgres "$PGDATA/.pgpass"
    chmod 600 "$PGDATA/.pgpass"
}

# Points the standby at $1 through postgresql.auto.conf (the server is not running yet).
configure_standby() {
    local primary="$1" conf="$PGDATA/postgresql.auto.conf"
    touch "$PGDATA/standby.signal" "$conf"
    sed -i '/^primary_conninfo/d;/^primary_slot_name/d' "$conf"
    {
        echo "primary_conninfo = 'host=$primary port=$PORT user=$PG_REPL_USER application_name=$PG_NODE_NAME passfile=$PGDATA/.pgpass'"
        [ -n "$SLOT_NAME" ] && echo "primary_slot_name = '$SLOT_NAME'"
    } >> "$conf"
    chown postgres:postgres "$PGDATA/standby.signal" "$conf"
    write_pgpass
}

ensure_slot_on() {
    local primary="$1" active
    [ -n "$SLOT_NAME" ] || return 0
    active=$(peer_sql "$primary" "SELECT active FROM pg_replication_slots WHERE slot_name = '$SLOT_NAME';" || true)
    if [ "$active" = "t" ]; then
        log "Slot $SLOT_NAME is in use on $primary by another connection; refusing to share it." >&2
        exit 1
    fi
    if [ "$active" = "f" ]; then
        # An old slot may point at WAL that is gone; start from a fresh one.
        PGPASSWORD="$PG_REPL_PASSWORD" psql \
            "host=$primary port=$PORT user=$PG_REPL_USER dbname=replication replication=true" \
            -c "DROP_REPLICATION_SLOT $SLOT_NAME" >/dev/null
    fi
}

# Standby restart: keep our existing slot (it holds the WAL we still need) or create it.
create_slot_if_missing() {
    local primary="$1"
    [ -n "$SLOT_NAME" ] || return 0
    [ -n "$(peer_sql "$primary" "SELECT 1 FROM pg_replication_slots WHERE slot_name = '$SLOT_NAME';" || true)" ] && return 0
    log "Creating slot $SLOT_NAME on $primary"
    PGPASSWORD="$PG_REPL_PASSWORD" psql \
        "host=$primary port=$PORT user=$PG_REPL_USER dbname=replication replication=true" \
        -c "CREATE_REPLICATION_SLOT $SLOT_NAME PHYSICAL RESERVE_WAL" >/dev/null ||
        log "WARNING: could not create slot $SLOT_NAME on $primary"
}

clone_from() {
    local primary="$1" staging slot_opts=()
    log "Cloning data directory from $primary"
    ensure_slot_on "$primary"
    [ -n "$SLOT_NAME" ] && slot_opts=(--slot="$SLOT_NAME" --create-slot)

    find "$PGDATA" -mindepth 1 -delete
    staging=$(mktemp -d "${PGDATA}.clone.XXXXXX")
    chown postgres:postgres "$staging"
    trap 'rm -rf -- "$staging"' EXIT
    PGPASSWORD="$PG_REPL_PASSWORD" gosu postgres pg_basebackup \
        --host="$primary" --port="$PORT" --username="$PG_REPL_USER" \
        --pgdata="$staging" --wal-method=stream --checkpoint=fast \
        --no-password "${slot_opts[@]}"
    shopt -s dotglob
    mv "$staging"/* "$PGDATA"/
    shopt -u dotglob
    rmdir "$staging"
    trap - EXIT
    # The clone carries the source's credentials file; it is rewritten below.
    rm -f "$PGDATA/.pgpass"
}

start_server() {
    unset PG_REPL_PASSWORD
    export PGPASSFILE="$PGDATA/.pgpass"
    exec docker-entrypoint.sh postgres "${SERVER_OPTS[@]}"
}

mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"

read -r primary primary_tl <<< "$(find_primary)" || true
primary="${primary:-}"
primary_tl="${primary_tl:-0}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
    if [ -z "$primary" ] && [ "$BOOTSTRAP_PRIMARY" = "true" ]; then
        log "No primary found and no local data: initialising a new cluster as PRIMARY"
        start_server
    fi
    waited=0
    while [ -z "$primary" ]; do
        if [ "$waited" -ge "$PRIMARY_WAIT_SEC" ]; then
            log "No primary found after ${PRIMARY_WAIT_SEC}s; exiting so the container restarts" >&2
            exit 1
        fi
        sleep 3
        waited=$((waited + 3))
        read -r primary primary_tl <<< "$(find_primary)" || true
        primary="${primary:-}"
    done
    clone_from "$primary"
    configure_standby "$primary"
    log "Starting as STANDBY of $primary"
    start_server
fi

if [ -f "$PGDATA/standby.signal" ]; then
    if [ -n "$primary" ]; then
        create_slot_if_missing "$primary"
        configure_standby "$primary"
        log "Starting as STANDBY of $primary"
    else
        log "Starting as STANDBY; no primary reachable yet, keeping the previous upstream"
    fi
    start_server
fi

# No standby.signal: this node was a primary when it stopped.
if [ -n "$primary" ]; then
    own_tl=$(local_timeline || true)
    [[ "$own_tl" =~ ^[0-9]+$ ]] || own_tl=0
    if [ "$primary_tl" -ge "$own_tl" ]; then
        log "Stale primary (timeline $own_tl): $primary is PRIMARY on timeline $primary_tl. Re-cloning as STANDBY."
        clone_from "$primary"
        configure_standby "$primary"
        start_server
    fi
    log "Peer $primary claims PRIMARY on older timeline $primary_tl (ours $own_tl); starting as PRIMARY and leaving fencing to the sentinel"
fi

log "Starting as PRIMARY"
start_server
