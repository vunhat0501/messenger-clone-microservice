# Database replication

The implementations are `apps/api/apps/auth-service` and
`apps/api/apps/chat-service`. Database configuration is validated in
`apps/api/apps/api/src/config/env.config.ts`.

## Environment

Add these settings to the root `.env`, retaining the existing database,
RabbitMQ, Redis and JWT settings. Replace all placeholder passwords; URL-encode
credentials inside connection strings.

```dotenv
DB_USER=postgres
DB_PASS=replace-me
DB_NAME=social
PG_REPL_USER=replicator
PG_REPL_PASSWORD=replace-with-a-separate-replication-password
DATABASE_URL=postgresql://postgres:replace-me@localhost:5432/social
DATABASE_REPLICA_URL=postgresql://postgres:replace-me@localhost:5433/social
DATABASE_REPLICA_2_URL=postgresql://postgres:replace-me@localhost:5434/social

MONGO_USER=admin
MONGO_PASS=replace-me
MONGO_REPLICA_SET=rs0
MONGO_READ_PREFERENCE=secondaryPreferred
```

For Chat running **inside the Compose network**, use:

```dotenv
MONGO_URI=mongodb://admin:replace-me@mongo_primary:27017,mongo_replica:27018,mongo_replica_2:27019/chat?authSource=admin
```

For Auth inside that network, use `postgres_primary:5432`, `postgres_replica:5432`, and `postgres_replica_2:5432` instead of the host endpoints above.

MongoDB drivers connect to the member addresses advertised by `rs0`:
`mongo_primary:27017`, `mongo_replica:27018` and `mongo_replica_2:27019`. Each
`mongod` listens on the same port it publishes, so only the names need resolving.
For the repository's host-based `pnpm dev`, map those names to the published
ports on the host instead of editing the hosts file:

```dotenv
MONGO_URI=mongodb://admin:replace-me@localhost:27017,localhost:27018,localhost:27019/chat?authSource=admin
MONGO_REPLICA_SET=rs0
MONGO_HOST_MAP=mongo_primary=127.0.0.1,mongo_replica=127.0.0.1,mongo_replica_2=127.0.0.1
```

Chat then follows a newly elected primary. Do not set `MONGO_HOST_MAP` when Chat
runs on the Compose network or against a hosted database.

Sets created before the members had their own ports advertise
`mongo_replica:27017`. Recreate the two secondaries and rerun the init service;
it renames the members in place and keeps the data volumes:

```bash
docker compose up -d --wait mongo_replica mongo_replica_2
docker compose up mongo_init_rs
```

A `directConnection=true` URI to `localhost:27017` still works, but it talks to
that one node only: no replica read distribution and no failover.
For existing hosted databases, omit `DATABASE_REPLICA_URL` and
`MONGO_REPLICA_SET` unless the provider supplies corresponding replica endpoints
or a replica set name. Existing MongoDB URI replica set discovery still works.
`PG_REPL_PASSWORD` is required by Compose, but optional for applications using
hosted PostgreSQL.

## Startup and existing data

Check existing containers before starting the databases:

```sh
docker compose ps
docker compose up -d postgres_primary postgres_replica postgres_replica_2 mongo_primary mongo_replica mongo_replica_2 mongo_init_rs
docker compose logs mongo_init_rs
```

Primary volumes retain the existing `postgres_data` and `mongo_data` names.
Replica volumes and the private shared MongoDB keyfile volume are separate.
The MongoDB initializer is safe to rerun after restart; it waits for a primary
and secondary instead of resetting the replica set.

PostgreSQL image initialization scripts run only for an empty primary volume.
With an existing primary volume, create the replication role, physical slot and
HBA rule before starting its replica:

```sh
docker compose up -d postgres_primary
docker compose exec postgres_primary bash /docker-entrypoint-initdb.d/postgres-init-repl.sh
docker compose exec postgres_primary sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_reload_conf();"'
docker compose up -d postgres_replica
```

Run the replication setup script once: existing role/slot conflicts intentionally
fail instead of changing credentials. Do not delete primary volumes to rerun
initialization. Existing MongoDB volumes must already contain an administrative
user matching `MONGO_USER`/`MONGO_PASS`; image environment variables do not reset
credentials on existing data.

A PostgreSQL standby reuses its data on restart. Every node has its own physical
slot (`auth_primary`, `auth_replica`, `auth_replica_2`), which retains WAL on the
current primary while that node is offline. `max_slot_wal_keep_size` (default
`1GB`, `PG_MAX_SLOT_WAL_KEEP_SIZE`) bounds that retention, so a node that stays
offline longer is re-cloned instead of filling the primary's disk. Rotating
replication credentials requires a planned maintenance operation.

All three PostgreSQL services start through `scripts/postgres-node.sh`. A node
does not assume its role from its service name: after a failover any of them can
be the primary, so use the verification commands below (or
`scripts/simulate-failover.ps1`) to see the current roles.

## Routing and consistency

- TypeORM directs writes, transactions and default reads to the primary. Only
  the user directory (`UserService.findAll`) explicitly requests a replica.
  Without a replica configured, TypeORM uses the primary for that query too.
- Credentials, refresh tokens, profiles and registration checks stay on the
  PostgreSQL primary, avoiding authentication errors caused by replication lag.
- MongoDB writes use the current primary, retryable writes and majority write
  concern with a ten-second acknowledgement timeout. Conversation listings and
  message history use `MONGO_READ_PREFERENCE`; membership checks and queries
  used to decide writes stay on the primary. List/history reads can lag behind
  writes; use `primary` if immediate visibility is required.

## Verification

```sh
docker compose exec postgres_primary sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT application_name, state, sync_state FROM pg_stat_replication;"'
docker compose exec postgres_replica sh -c 'psql -U postgres -d postgres -c "SELECT pg_is_in_recovery();"'
docker compose exec mongo_primary sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "rs.status().members.map(m => ({name:m.name,state:m.stateStr}))"'
```

For the standby query, replace `postgres` with your `DB_USER` and `DB_NAME`.
Expect PostgreSQL `streaming`, `pg_is_in_recovery() = true`, and one MongoDB
`PRIMARY` plus one `SECONDARY`. Verify an application write on the primary
becomes visible on the replica. The scripts use LF endings via `.gitattributes`;
retain executable modes when copying them to Linux.

## Failover and Promotion

### PostgreSQL Automatic Failover & Promotion

One daemon container (`postgres_sentinel`, `scripts/postgres-sentinel.sh`) watches all
three nodes every 5 seconds. It never assumes which node is the primary: each round
it asks every node `pg_is_in_recovery()`, so it can fail over repeatedly.

| Situation | What the sentinel does |
| --- | --- |
| Exactly one primary | Makes sure every standby follows it: creates the standby's slot on the primary and, if needed, repoints `primary_conninfo` and `primary_slot_name` with `ALTER SYSTEM` and `pg_reload_conf()` (no restart). |
| No reachable primary for 3 rounds (about 15 s) | Looks at the reachable standbys. If one is still `streaming`, the primary is alive and only the sentinel lost sight of it, so it does **not** promote. Otherwise it promotes the standby with the most received WAL (`pg_promote()`) and repoints the others. |
| Two primaries (an old primary came back writable) | Keeps the one it already follows, or the higher timeline if it never followed one, and shuts the other down with `COPY ... TO PROGRAM 'kill -INT 1'`. Docker restarts that container. |

When a container starts, `scripts/postgres-node.sh` looks for a primary among its peers.
A node whose data directory belongs to an old primary (the peer is on a newer or equal
timeline) discards it and re-clones itself as a standby with `pg_basebackup`. An empty
data directory is cloned the same way; only `postgres_primary` may initialise a brand-new cluster.

`auth-service` follows the promotion by itself: `PostgresTopologyWatcher` re-checks the
three configured URLs every 5 seconds and reconnects when the primary changes. When two
nodes claim to be primary it picks the one on the highest timeline and ignores the other
for reads and writes (`pg-topology.resolver.ts`).

Measured on a single machine (`report/README.md`, section 4.9): writes recover about 23 to 26
seconds after the primary stops or is cut off, the old primary rejoins as a standby in 2 to 6
seconds, and no run ended with two writable primaries.

**Limits.** The sentinel is a single process (no majority vote between several sentinels).
Replication is asynchronous, so commits not yet streamed when the primary fails are lost.
Fencing needs the sentinel's database user to be a superuser and kills the container's main
process, which suits a development stack, not production. A stale primary is re-cloned in full
instead of being rewound with `pg_rewind`, and writes it accepted while cut off are discarded.

### PostgreSQL Manual Failover (Optional)

You can still promote a standby by hand, but stop the sentinel first or it may react:

```sh
docker compose stop postgres_sentinel
docker compose exec postgres_replica psql -U postgres -d postgres -c "SELECT pg_promote();"
```

Start the sentinel again afterwards; it repoints the remaining standbys and shuts down the
old primary if it is still writable.

### MongoDB Automatic Failover
With a **3-node replica set** (`mongo_primary`, `mongo_replica`, `mongo_replica_2`), MongoDB performs **automatic election and promotion** via Raft-like consensus:
- If `mongo_primary` goes down, the 2 remaining secondaries form a majority quorum (2 out of 3 votes) and automatically elect a new `PRIMARY`.
- MongoDB drivers and Mongoose discover the new primary node and reroute writes without manual reconfiguration. Writes fail briefly during the election (about 10 to 12 seconds when measured).
- When `mongo_primary` recovers, it rejoins the replica set as a `SECONDARY` and catches up via oplog.

To manually trigger or test election in MongoDB:
```sh
docker compose exec mongo_primary sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "rs.stepDown(60)"'
```

## Availability limits

This topology provides replication, read distribution and automatic PostgreSQL
failover, but not uninterrupted availability: writes stop for roughly 25 seconds
while the sentinel confirms the failure and promotes a standby. PostgreSQL streaming
is asynchronous, so unreplicated commits can be lost during promotion, and the single
sentinel is itself a point of failure. TypeORM does not fall back from an unavailable
configured reader; `PostgresTopologyWatcher` rebuilds the connections when the primary changes.

A two-voter MongoDB set needs both votes to elect/retain a primary and acknowledge
majority writes. Losing either member stops writes. A third voting data-bearing
member is needed to tolerate one failed member with majority writes. Production
PostgreSQL HA also needs a failover coordinator and a stable writer endpoint.
See [TypeORM replication](https://typeorm.io/docs/data-source/multiple-data-sources/),
[PostgreSQL streaming replication](https://www.postgresql.org/docs/18/warm-standby.html),
and [MongoDB replica set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/).
