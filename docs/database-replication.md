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

MONGO_USER=admin
MONGO_PASS=replace-me
MONGO_REPLICA_SET=rs0
MONGO_READ_PREFERENCE=secondaryPreferred
```

For Chat running **inside the Compose network**, use:

```dotenv
MONGO_URI=mongodb://admin:replace-me@mongo_primary:27017,mongo_replica:27017/chat?authSource=admin
```

For Auth inside that network, use `postgres_primary:5432` and
`postgres_replica:5432` instead of the host endpoints above.

MongoDB drivers discover the member addresses advertised by `rs0`, which are
`mongo_primary:27017` and `mongo_replica:27017`. Both addresses must resolve and
route correctly from Chat. The repository's host-based `pnpm dev` cannot discover
both members through the published localhost ports alone: a hosts-file alias is
insufficient because the secondary advertises port 27017 but publishes 27018.
Run Chat on the Compose network or provide routing/DNS for both advertised
addresses. For a host-based development connection to the primary only, use:

```dotenv
MONGO_URI=mongodb://admin:replace-me@localhost:27017/chat?authSource=admin&directConnection=true
MONGO_READ_PREFERENCE=primary
```

Direct connections do not provide replica read distribution or failover.
For existing hosted databases, omit `DATABASE_REPLICA_URL` and
`MONGO_REPLICA_SET` unless the provider supplies corresponding replica endpoints
or a replica set name. Existing MongoDB URI replica set discovery still works.
`PG_REPL_PASSWORD` is required by Compose, but optional for applications using
hosted PostgreSQL.

## Startup and existing data

Check existing containers before starting the databases:

```sh
docker compose ps
docker compose up -d postgres_primary postgres_replica mongo_primary mongo_replica mongo_init_rs
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

The PostgreSQL replica reuses its standby data on restart. The physical slot
`auth_replica` retains WAL while it is offline; monitor primary disk usage and
manage WAL retention for a long-running deployment. Rebuilding a standby or
rotating replication credentials requires a planned maintenance operation.

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

## Availability limits

This requested topology provides replication and read distribution, but does
not guarantee availability after a node failure. PostgreSQL streaming is
asynchronous and requires manual promotion plus connection reconfiguration;
unreplicated commits can be lost during promotion. TypeORM does not automatically
promote a standby or fall back from an unavailable configured PostgreSQL reader.

A two-voter MongoDB set needs both votes to elect/retain a primary and acknowledge
majority writes. Losing either member stops writes. A third voting data-bearing
member is needed to tolerate one failed member with majority writes. Production
PostgreSQL HA also needs a failover coordinator and a stable writer endpoint.
See [TypeORM replication](https://typeorm.io/docs/data-source/multiple-data-sources/),
[PostgreSQL streaming replication](https://www.postgresql.org/docs/18/warm-standby.html),
and [MongoDB replica set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/).
