// Repeated PostgreSQL failover: ATTENDED USE ONLY (stops and isolates database containers).
// Each round finds the current primary, takes it out, measures how long sign-in (a write: it stores
// the refresh token) fails, brings the node back and measures how long it takes to rejoin as a
// streaming standby. Modes:
//   stop      - docker stop the primary, then docker start it (crash and return).
//   partition - disconnect the primary from the Compose network, then reconnect it. The old primary
//               comes back still read-write, so the sentinel must fence it (split brain).
// Usage: node f8_postgres_multi_failover.mjs [rounds=3] [mode=stop|partition]
import { exec, execFile } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { api, sleep } from './lib.mjs';

const sh = promisify(exec);
const execFileP = promisify(execFile);
const ROUNDS = Number(process.argv[2] ?? 3);
const MODE = process.argv[3] ?? 'stop';
const NETWORK = 'messenger-clone-microservice_default';
const NODES = [
  { service: 'postgres_primary', container: 'auth_postgres' },
  {
    service: 'postgres_replica',
    container: 'messenger-clone-microservice-postgres_replica-1',
  },
  {
    service: 'postgres_replica_2',
    container: 'messenger-clone-microservice-postgres_replica_2-1',
  },
];
const OUT = new URL(
  '../ket-qua/p10_postgres_multi_failover.csv',
  import.meta.url,
);

const psql = async (container, query) => {
  try {
    const { stdout } = await execFileP(
      'docker',
      [
        'exec',
        container,
        'sh',
        '-c',
        `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "${query}"`,
      ],
      { timeout: 8000 },
    );
    return stdout.trim();
  } catch {
    return 'error';
  }
};
const role = (node) => psql(node.container, 'SELECT pg_is_in_recovery()');
const primaries = async () => {
  const roles = await Promise.all(NODES.map(role));
  return NODES.filter((_, i) => roles[i] === 'f');
};
const streamingCount = (node) =>
  psql(
    node.container,
    "SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming'",
  );
const login = async () =>
  (
    await api('POST', '/auth/signin', {
      body: { email: 'alice@example.com', password: 'Alice@1234' },
      base: 'http://localhost:8008',
    })
  ).status;

async function waitFor(check, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await check()) return Date.now() - t0;
    await sleep(1000);
  }
  return null;
}

async function takeOut(node) {
  if (MODE === 'partition')
    await sh(`docker network disconnect ${NETWORK} ${node.container}`);
  else await sh(`docker stop ${node.container}`);
}
async function bringBack(node) {
  if (MODE === 'partition') {
    // Compose aliases are lost on disconnect; restore both names the peers use.
    await sh(
      `docker network connect --alias ${node.service} --alias ${node.container} ${NETWORK} ${node.container}`,
    );
  } else await sh(`docker start ${node.container}`);
}

if (!existsSync(OUT)) {
  writeFileSync(
    OUT,
    'mode,round,old_primary,new_primary,write_outage_ms,split_brain_seen,rejoin_ms,standbys_streaming_after,app_fix\n',
  );
}

for (let round = 1; round <= ROUNDS; round++) {
  const current = await primaries();
  if (current.length !== 1) {
    console.log(
      `round ${round}: expected one primary, found ${current.map((n) => n.service).join(',') || 'none'}; stopping`,
    );
    break;
  }
  const old = current[0];
  console.log(`round ${round} (${MODE}): primary is ${old.service}`);

  const t0 = Date.now();
  const series = [];
  let done = false;
  const probe = (async () => {
    while (!done && Date.now() - t0 < 240000) {
      let s;
      try {
        s = await Promise.race([login(), sleep(8000).then(() => 'timeout')]);
      } catch {
        s = 'err';
      }
      series.push({ t: Date.now() - t0, s });
      await sleep(500);
    }
  })();

  await sleep(3000);
  const outAt = Date.now() - t0;
  await takeOut(old);

  // A different node must become the only reachable primary.
  let newPrimary = null;
  await waitFor(async () => {
    const p = (await primaries()).filter((n) => n !== old);
    newPrimary = p.length === 1 ? p[0] : null;
    return newPrimary !== null;
  }, 90000);
  // Let the auth-service watcher catch up before judging the outage.
  await waitFor(
    async () =>
      series.some(
        (x) =>
          x.t > outAt &&
          x.s === 201 &&
          series.some((y) => y.t > outAt && y.t < x.t && y.s !== 201),
      ),
    120000,
  );
  done = true;
  await probe;
  const firstFail = series.find((x) => x.t >= outAt && x.s !== 201);
  const recovered = series.find(
    (x) => firstFail && x.t > firstFail.t && x.s === 201,
  );
  const outage = firstFail && recovered ? recovered.t - outAt : null;

  await bringBack(old);
  let splitSeen = false;
  const rejoinMs = await waitFor(async () => {
    const p = await primaries();
    if (p.length > 1) splitSeen = true;
    return (
      (await role(old)) === 't' &&
      newPrimary &&
      (await streamingCount(newPrimary)) === '2'
    );
  }, 180000);
  const streaming = newPrimary ? await streamingCount(newPrimary) : 'n/a';

  const row = [
    MODE,
    round,
    old.service,
    newPrimary?.service ?? 'none',
    outage ?? '',
    splitSeen,
    rejoinMs ?? '',
    streaming,
    'after',
  ];
  appendFileSync(OUT, row.join(',') + '\n');
  console.log(
    JSON.stringify({
      round,
      old: old.service,
      new: newPrimary?.service,
      write_outage_ms: outage,
      split_brain_seen: splitSeen,
      rejoin_ms: rejoinMs,
      standbys_streaming_after: streaming,
    }),
  );
  await sleep(5000);
}
process.exit(0);
