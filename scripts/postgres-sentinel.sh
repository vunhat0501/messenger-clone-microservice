#!/bin/bash
# PostgreSQL sentinel: watches every node, promotes a standby when no primary is
# left, keeps the standbys following the current primary and fences a second
# primary (split brain). It can fail over repeatedly: it never assumes which
# service is the primary, it asks every node on each round.
set -uo pipefail

NODES=(${PG_NODES:-${PRIMARY_HOST:-postgres_primary} ${REPLICA_1_HOST:-postgres_replica} ${REPLICA_2_HOST:-postgres_replica_2}})
PORT="${PRIMARY_PORT:-5432}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"
CHECK_INTERVAL="${CHECK_INTERVAL_SEC:-5}"
REPL_USER="${PG_REPL_USER:-replicator}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-3}"

# Each standby keeps its own slot name wherever it replicates from.
declare -A SLOT_OF=()
for pair in ${PG_NODE_SLOTS:-postgres_primary=auth_primary postgres_replica=auth_replica postgres_replica_2=auth_replica_2}; do
    SLOT_OF["${pair%%=*}"]="${pair#*=}"
done

CURRENT_PRIMARY=""
FAIL_COUNT=0

log() { echo "[$(date -u +%FT%TZ)] $*"; }

sql() {
    local host="$1"
    shift
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$host" -p "$PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -v ON_ERROR_STOP=1 -qtA "$@" 2>/dev/null
}

node_role() { sql "$1" -c "SELECT pg_is_in_recovery();" || echo "error"; }

timeline_of() {
    PGPASSWORD="${PG_REPL_PASSWORD:-}" psql \
        "host=$1 port=$PORT user=$REPL_USER dbname=replication replication=true" \
        -tA -c IDENTIFY_SYSTEM 2>/dev/null | cut -d'|' -f2
}

# Received-or-replayed WAL position as a number, to pick the least stale standby.
wal_position_of() {
    sql "$1" -c "SELECT pg_wal_lsn_diff(GREATEST(COALESCE(pg_last_wal_receive_lsn(), '0/0'), COALESCE(pg_last_wal_replay_lsn(), '0/0')), '0/0')::bigint;" || echo -1
}

is_streaming() {
    [ "$(sql "$1" -c "SELECT count(*) FROM pg_stat_wal_receiver WHERE status = 'streaming';")" = "1" ]
}

ensure_slot() {
    local primary="$1" slot="$2"
    [ -n "$slot" ] || return 0
    sql "$primary" -v slot="$slot" <<'SQL' >/dev/null
SELECT pg_create_physical_replication_slot(:'slot', true)
WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = :'slot');
SQL
}

# Repoint a running standby to $2 without restarting it (both settings reload on SIGHUP).
repoint() {
    local node="$1" primary="$2" slot="${SLOT_OF[$1]:-}" datadir conninfo
    ensure_slot "$primary" "$slot" || log "WARNING: could not create slot $slot on $primary"
    datadir=$(sql "$node" -c "SHOW data_directory;") || return 1
    # No password here: postgres-node.sh writes a wildcard .pgpass in the data directory.
    conninfo="host=$primary port=$PORT user=$REPL_USER application_name=$node passfile=$datadir/.pgpass"
    if sql "$node" -v conninfo="$conninfo" -v slot="$slot" <<'SQL' >/dev/null
ALTER SYSTEM SET primary_conninfo = :'conninfo';
ALTER SYSTEM SET primary_slot_name = :'slot';
SELECT pg_reload_conf();
SQL
    then
        log "Standby $node now follows $primary (slot: ${slot:-none})"
    else
        log "WARNING: could not repoint standby $node to $primary"
    fi
}

ensure_following() {
    local node="$1" primary="$2" host_now slot_now
    host_now=$(sql "$node" -c "SHOW primary_conninfo;" | grep -o 'host=[^ ]*' | cut -d= -f2)
    slot_now=$(sql "$node" -c "SHOW primary_slot_name;")
    if [ "$host_now" != "$primary" ] || [ "$slot_now" != "${SLOT_OF[$node]:-}" ]; then
        repoint "$node" "$primary"
    fi
}

# A primary never needs a slot named after itself; such a slot only holds back WAL.
drop_own_slot() {
    local primary="$1" slot="${SLOT_OF[$1]:-}"
    [ -n "$slot" ] || return 0
    sql "$primary" -v slot="$slot" <<'SQL' >/dev/null
SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots
WHERE slot_name = :'slot' AND NOT active;
SQL
}

# Fast shutdown of a stale primary. Its container restarts and postgres-node.sh
# re-clones it as a standby of the current primary.
fence() {
    local node="$1" keep="$2"
    log "FENCING $node: $keep is the legitimate primary; shutting $node down"
    sql "$node" -c "COPY (SELECT 1) TO PROGRAM 'kill -INT 1';" >/dev/null ||
        log "WARNING: could not fence $node"
}

resolve_split_brain() {
    local keep="" best_tl=-1 node tl
    for node in "$@"; do
        if [ "$node" = "$CURRENT_PRIMARY" ]; then
            keep="$node"
            break
        fi
    done
    if [ -z "$keep" ]; then
        for node in "$@"; do
            tl=$(timeline_of "$node")
            [[ "$tl" =~ ^[0-9]+$ ]] || tl=0
            if [ "$tl" -gt "$best_tl" ]; then
                keep="$node"
                best_tl="$tl"
            fi
        done
    fi
    log "SPLIT BRAIN: primaries are $*; keeping $keep"
    for node in "$@"; do
        [ "$node" = "$keep" ] || fence "$node" "$keep"
    done
    CURRENT_PRIMARY="$keep"
}

failover() {
    local standbys=("$@") best="" best_pos=-1 node pos
    if [ ${#standbys[@]} -eq 0 ]; then
        log "CRITICAL: no primary and no reachable standby to promote"
        return
    fi
    # Second opinion: a standby still streaming means a primary is alive and only
    # the sentinel lost sight of it. Promoting now would create a split brain.
    for node in "${standbys[@]}"; do
        if is_streaming "$node"; then
            log "Not failing over: standby $node is still streaming from a primary (sentinel may be isolated)"
            return
        fi
    done
    for node in "${standbys[@]}"; do
        pos=$(wal_position_of "$node")
        [[ "$pos" =~ ^-?[0-9]+$ ]] || pos=-1
        if [ "$pos" -gt "$best_pos" ]; then
            best="$node"
            best_pos="$pos"
        fi
    done
    log "FAILOVER: promoting $best (WAL position $best_pos) among: ${standbys[*]}"
    sql "$best" -c "SELECT pg_promote(true, 60);" >/dev/null
    if [ "$(node_role "$best")" != "f" ]; then
        log "FAILED: $best did not leave recovery"
        return
    fi
    log "Failover complete: new primary is $best"
    CURRENT_PRIMARY="$best"
    FAIL_COUNT=0
    for node in "${standbys[@]}"; do
        [ "$node" = "$best" ] || repoint "$node" "$best"
    done
}

log "PostgreSQL sentinel watching: ${NODES[*]} (every ${CHECK_INTERVAL}s, failover after $FAIL_THRESHOLD failed rounds)"

while true; do
    primaries=()
    standbys=()
    for node in "${NODES[@]}"; do
        case "$(node_role "$node")" in
            f) primaries+=("$node") ;;
            t) standbys+=("$node") ;;
        esac
    done

    if [ ${#primaries[@]} -gt 1 ]; then
        resolve_split_brain "${primaries[@]}"
    elif [ ${#primaries[@]} -eq 1 ]; then
        if [ "${primaries[0]}" != "$CURRENT_PRIMARY" ]; then
            log "Primary is ${primaries[0]}"
            CURRENT_PRIMARY="${primaries[0]}"
        fi
        [ "$FAIL_COUNT" -gt 0 ] && log "Primary reachable again"
        FAIL_COUNT=0
        for node in "${standbys[@]}"; do
            ensure_following "$node" "$CURRENT_PRIMARY"
        done
        drop_own_slot "$CURRENT_PRIMARY"
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        log "No reachable primary (previous: ${CURRENT_PRIMARY:-unknown}), round $FAIL_COUNT/$FAIL_THRESHOLD"
        if [ "$FAIL_COUNT" -ge "$FAIL_THRESHOLD" ]; then
            failover "${standbys[@]}"
        fi
    fi

    sleep "$CHECK_INTERVAL"
done
