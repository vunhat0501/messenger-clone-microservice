// Postgres primary failure: ATTENDED USE ONLY.
// It stops the container `auth_postgres`, which is the primary only while `postgres_primary` still holds that role,
// so check the roles first. For several rounds, any primary and a partition mode, use f8_postgres_multi_failover.mjs.
// Roles are not restored automatically: the old primary rejoins as a standby of the promoted node.
// Measures how long sign-in (a write: it stores the refresh token) keeps failing after the primary stops.
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { api, sleep } from './lib.mjs';
const sh = promisify(exec);
const login = async () => (await api('POST', '/auth/signin', { body: { email: 'alice@example.com', password: 'Alice@1234' }, base: 'http://localhost:8008' })).status;
const t0 = Date.now(); const series = []; let stopAt = null;
const probe = (async () => { while (Date.now() - t0 < 90000) { const t = Date.now() - t0; let s; try { s = await Promise.race([login(), sleep(8000).then(() => 'timeout')]); } catch { s = 'err'; } series.push({ t, s }); await sleep(500); } })();
await sleep(3000); await sh('docker stop auth_postgres'); stopAt = Date.now() - t0;
await probe;
const firstFail = series.find((x) => x.t >= stopAt && x.s !== 201);
const recovered = series.find((x) => firstFail && x.t > firstFail.t && x.s === 201);
console.log(JSON.stringify({ stopped_at_ms: stopAt, first_failure_after_stop_ms: firstFail ? firstFail.t - stopAt : null, recovered_after_stop_ms: recovered ? recovered.t - stopAt : null }, null, 2));
console.log('Restore: docker start auth_postgres (it rebuilds itself as a standby of the promoted node).');
process.exit(0);
