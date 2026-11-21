#!/bin/bash
set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-postgres_primary}"
REPLICA_1_HOST="${REPLICA_1_HOST:-postgres_replica}"
REPLICA_2_HOST="${REPLICA_2_HOST:-postgres_replica_2}"
PORT="${PRIMARY_PORT:-5432}"

FAIL_COUNT=0
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"
CHECK_INTERVAL="${CHECK_INTERVAL_SEC:-5}"

export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

echo "Starting PostgreSQL Sentinel daemon..."
echo "Primary Host: $PRIMARY_HOST"
echo "Replica 1 Host: $REPLICA_1_HOST"
echo "Replica 2 Host: $REPLICA_2_HOST"

check_is_master() {
    local host="$1"
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$host" -p "$PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "error"
}

promote_node() {
    local target="$1"
    echo "============================================================"
    echo "[$(date -u)] ATTEMPTING AUTOMATIC PROMOTION OF: $target"
    echo "============================================================"

    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$target" -p "$PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_promote();" || true

    sleep 2
    local status
    status=$(check_is_master "$target")

    if [ "$status" = "f" ]; then
        echo "[$(date -u)] SUCCESS: $target is now promoted to PRIMARY (pg_is_in_recovery() = false)!"
        return 0
    else
        echo "[$(date -u)] FAILED: Could not promote $target (status: $status)."
        return 1
    fi
}

while true; do
    primary_status=$(check_is_master "$PRIMARY_HOST")

    if [ "$primary_status" = "f" ]; then
        # Primary is healthy and in read-write mode
        if [ $FAIL_COUNT -gt 0 ]; then
            echo "[$(date -u)] Primary $PRIMARY_HOST recovered."
        fi
        FAIL_COUNT=0
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        echo "[$(date -u)] Warning: Primary $PRIMARY_HOST health check failed (Count: $FAIL_COUNT / $FAIL_THRESHOLD). Status: $primary_status"

        if [ $FAIL_COUNT -ge $FAIL_THRESHOLD ]; then
            echo "[$(date -u)] Primary $PRIMARY_HOST is down! Initiating automatic failover..."

            # First, check if one of the replicas was already promoted
            r1_status=$(check_is_master "$REPLICA_1_HOST")
            r2_status=$(check_is_master "$REPLICA_2_HOST")

            if [ "$r1_status" = "f" ]; then
                echo "[$(date -u)] $REPLICA_1_HOST is already acting as PRIMARY."
            elif [ "$r2_status" = "f" ]; then
                echo "[$(date -u)] $REPLICA_2_HOST is already acting as PRIMARY."
            else
                # Elect and promote Replica 1, fallback to Replica 2
                if [ "$r1_status" = "t" ]; then
                    if promote_node "$REPLICA_1_HOST"; then
                        echo "[$(date -u)] Failover complete. New primary is $REPLICA_1_HOST."
                        FAIL_COUNT=0
                        sleep 10
                        continue
                    fi
                fi

                if [ "$r2_status" = "t" ]; then
                    if promote_node "$REPLICA_2_HOST"; then
                        echo "[$(date -u)] Failover complete. New primary is $REPLICA_2_HOST."
                        FAIL_COUNT=0
                        sleep 10
                        continue
                    fi
                fi

                echo "[$(date -u)] CRITICAL: Unable to promote any standby replicas!"
            fi
        fi
    fi

    sleep "$CHECK_INTERVAL"
done
