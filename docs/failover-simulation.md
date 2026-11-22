# Database Failover & Replica Promotion Simulation Guide

This guide provides test scenarios, verification commands, and automated scripts to simulate primary database failure, observe automated election/promotion, and verify that the application dynamically adapts and keeps processing read/write operations without downtime or read-only transaction errors.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph PostgreSQL_Cluster ["PostgreSQL 3-Node Topology"]
        P_PG["postgres_primary:5432 (Primary)"]
        R1_PG["postgres_replica:5433 (Standby)"]
        R2_PG["postgres_replica_2:5434 (Standby)"]
        Sentinel["postgres_sentinel (Daemon)"]
        Sentinel -. "Heartbeat (5s)" .-> P_PG
        Sentinel == "Failover: pg_promote()" ==> R1_PG
    end

    subgraph MongoDB_Cluster ["MongoDB Replica Set (rs0)"]
        P_MG["mongo_primary:27017 (PRIMARY, priority: 2)"]
        R1_MG["mongo_replica:27018 (SECONDARY, priority: 1)"]
        R2_MG["mongo_replica_2:27019 (SECONDARY, priority: 1)"]
        P_MG <-->|Heartbeats & Raft Consensus| R1_MG
        R1_MG <-->|Heartbeats & Raft Consensus| R2_MG
    end

    subgraph NestJS_App ["Backend Services (Dynamic Resolvers)"]
        AUTH["auth-service (resolvePostgresTopology)"]
        CHAT["chat-service (resolveMongoTopology)"]
        AUTH -->|"Detects Read-Write Primary (pg_is_in_recovery = false)"| PostgreSQL_Cluster
        CHAT -->|"Detects Writable Primary (isWritablePrimary = true)"| MongoDB_Cluster
    end
```

---

## SCENARIO 1: MongoDB Primary Failure & Automatic Promotion

MongoDB handles election and failover natively via Raft-like consensus. When the primary goes down, the surviving secondaries form a quorum ($2/3$) and elect a new primary. NestJS `chat-service` dynamically identifies the new primary via `resolveMongoTopology`.

### Step 1: Check Current State Before Crash

```bash
docker compose exec mongo_primary mongosh -u admin -p password --eval "rs.status().members.map(m => ({ name: m.name, stateStr: m.stateStr }))"
```

_Expected Output:_

```json
[
  { "name": "mongo_primary:27017", "stateStr": "PRIMARY" },
  { "name": "mongo_replica:27018", "stateStr": "SECONDARY" },
  { "name": "mongo_replica_2:27019", "stateStr": "SECONDARY" }
]
```

### Step 2: Simulate Primary Node Crash

Stop the `mongo_primary` container:

```bash
docker compose stop mongo_primary
```

### Step 3: Observe Automatic Election & Promotion

Query one of the surviving secondaries (`mongo_replica` on port 27018):

```bash
docker compose exec mongo_replica mongosh --port 27018 -u admin -p password --eval "rs.status().members.map(m => ({ name: m.name, stateStr: m.stateStr, health: m.health }))"
```

_Result:_

- `mongo_primary:27017` is marked `health: 0` (unreachable).
- One of the surviving nodes (`mongo_replica:27018` or `mongo_replica_2:27019`) is automatically promoted to **`PRIMARY`**!

### Step 4: Verify Application Dynamic Routing

Test that the backend dynamic topology resolver automatically routes writes to the promoted node:

```bash
pnpm --filter api exec node -r ts-node/register -r tsconfig-paths/register -e "const { resolveMongoTopology } = require('./apps/chat-service/src/database/mongo-topology.resolver'); resolveMongoTopology(['mongodb://admin:password@localhost:27017/chat_db?authSource=admin&directConnection=true', 'mongodb://admin:password@localhost:27018/chat_db?authSource=admin&directConnection=true', 'mongodb://admin:password@localhost:27019/chat_db?authSource=admin&directConnection=true']).then(console.log);"
```

_Expected Output:_
`primaryUri` automatically switches to `localhost:27018`!

### Step 5: Recover Primary (Rejoins as Secondary/Primary)

```bash
docker compose start mongo_primary
```

The old primary restarts, catches up from the oplog, and re-stabilizes in the cluster without crashing or corrupting data.

---

## SCENARIO 2: PostgreSQL Primary Failure & Automated Promotion

PostgreSQL streaming replication is continuously monitored by the **`postgres_sentinel`** container daemon.

### Step 1: Verify Initial Replication State

Check `pg_is_in_recovery()` across all 3 nodes:

```bash
# Primary should return 'f' (false = read-write)
docker compose exec postgres_primary psql -U postgres -d postgres -tAc "SELECT pg_is_in_recovery();"

# Standby 1 should return 't' (true = read-only replica)
docker compose exec postgres_replica psql -U postgres -d postgres -tAc "SELECT pg_is_in_recovery();"

# Standby 2 should return 't' (true = read-only replica)
docker compose exec postgres_replica_2 psql -U postgres -d postgres -tAc "SELECT pg_is_in_recovery();"
```

### Step 2: Open Sentinel Monitor Logs in Real Time

In a separate terminal window, follow the sentinel daemon logs:

```bash
docker compose logs -f postgres_sentinel
```

### Step 3: Simulate Primary Node Crash

Stop `postgres_primary`:

```bash
docker compose stop postgres_primary
```

### Step 4: Observe Automatic Standby Promotion

Watch the `postgres_sentinel` terminal. Within ~15–20 seconds (3 failed health probes at 5s intervals), sentinel triggers promotion:

```log
Warning: Primary postgres_primary health check failed (Count: 1 / 3).
Warning: Primary postgres_primary health check failed (Count: 2 / 3).
Warning: Primary postgres_primary health check failed (Count: 3 / 3).
Primary postgres_primary is down! Initiating automatic failover...
============================================================
ATTEMPTING AUTOMATIC PROMOTION OF: postgres_replica
============================================================
SUCCESS: postgres_replica is now promoted to PRIMARY (pg_is_in_recovery() = false)!
Failover complete. New primary is postgres_replica.
```

### Step 5: Verify the Promoted Node Accepts Writes

Check the recovery status on `postgres_replica`:

```bash
docker compose exec postgres_replica psql -U postgres -d postgres -tAc "SELECT pg_is_in_recovery();"
```

_Expected output:_ **`f`** (`false` — node is now an active read-write PRIMARY).

Insert a test record directly into the promoted node:

```bash
docker compose exec postgres_replica psql -U postgres -d postgres -c "CREATE TABLE IF NOT EXISTS failover_test (id serial, created_at timestamp default now()); INSERT INTO failover_test DEFAULT VALUES; SELECT * FROM failover_test;"
```

### Step 6: Verify Backend Dynamic Routing (`auth-service`)

Verify that TypeORM detects the newly promoted node on port 5433 as `master`:

```bash
pnpm --filter api exec node -r ts-node/register -r tsconfig-paths/register -e "const { resolvePostgresTopology } = require('./apps/auth-service/src/database/pg-topology.resolver'); resolvePostgresTopology(['postgresql://postgres:postgres@localhost:5432/postgres?schema=public', 'postgresql://postgres:postgres@localhost:5433/postgres?schema=public', 'postgresql://postgres:postgres@localhost:5434/postgres?schema=public']).then(console.log);"
```

_Expected Output:_
`masterUrl` points to port `5433`, and ports `5432` / `5434` are assigned as `slaveUrls`.

### Step 7: Recover Primary Node (Split-Brain Prevention)

Start `postgres_primary` back up:

```bash
docker compose start postgres_primary
```

Check recovery status of `postgres_primary`:

```bash
docker compose exec postgres_primary psql -U postgres -d postgres -tAc "SELECT pg_is_in_recovery();"
```

_Expected output:_ **`t`** (`true` — split-brain prevention automatically demotes it to a read-only standby following the new primary).

---

## Automated Script for Fast Demo

You can run the end-to-end automated PowerShell script to demonstrate the entire failover cycle in one command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\simulate-failover.ps1
```
