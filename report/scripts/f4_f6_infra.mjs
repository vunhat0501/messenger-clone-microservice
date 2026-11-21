import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { login, connect, ensureConversation, api, sleep } from './lib.mjs';
import { portUp, startGateway, getPid } from './ops.mjs';

const sh = promisify(exec);
const which = process.argv[2];
const FAULTS = {
  rabbitmq: { kill: 'docker kill app_rabbitmq', start: 'docker start app_rabbitmq', downMs: 12000 },
  redis: { kill: 'docker kill app_redis', start: 'docker start app_redis', downMs: 12000 },
  mongo: { kill: 'docker kill chat_mongo', start: 'docker start chat_mongo', downMs: 15000 },
};
const F = FAULTS[which];
if (F && process.argv[3]) F.downMs = Number(process.argv[3]); // optional: outage length in ms
if (!F) { console.log('usage: node f4_f6_infra.mjs rabbitmq|redis|mongo'); process.exit(1); }

const alice = await login('alice', 'http://localhost:8008');
const bob = await login('bob', 'http://localhost:8009');
const conv = await ensureConversation(alice, bob);
let a = null;
async function ensureSocket() {
  if (a?.socket.connected) return true;
  try { a?.socket.close(); } catch {}
  const s = await connect('http://localhost:8008', alice.token, 'alice');
  if (s.socket.connected) { s.socket.emit('joinConversation', { conversationId: conv }); a = s; return true; }
  return false;
}
const timed = async (fn) => { const t = Date.now(); try { const ok = await fn(); return { ok, ms: Date.now() - t }; } catch (e) { return { ok: false, ms: Date.now() - t }; } };
const rest = (path) => async () => { const r = await api('GET', path, { token: alice.token, base: 'http://localhost:8008' }); return r.status === 200; };
async function probe() {
  const [warm, cold, send] = await Promise.all([
    timed(async () => { const c = new AbortController(); setTimeout(() => c.abort(), 12000); return (await rest('/chat/conversations')()); }),
    timed(rest(`/chat/conversations/${conv}/messages?limit=${300 + Math.floor(Math.random() * 5000)}`)),
    timed(async () => {
      if (!(await ensureSocket())) return false;
      return await new Promise((res) => a.socket.timeout(12000).emit('sendMessage', { conversationId: conv, text: 'probe', clientMessageId: `p${Date.now()}${Math.random()}` }, (e, s) => res(!e && !s?.error)));
    }),
  ]);
  return { warm, cold, send };
}

const series = [];
const T0 = Date.now();
let stopAt = null, startAt = null, electionMs = null, endProbe = false;
const loop = (async () => { while (!endProbe) { const t = Date.now() - T0; const p = await probe(); series.push({ t, ...p }); await sleep(700); } })();

await sleep(3500);
await sh(F.kill); stopAt = Date.now() - T0;
if (which === 'mongo') {
  (async () => {
    for (let i = 0; i < 30 && electionMs === null; i++) {
      try {
        const { stdout } = await sh(`docker exec messenger-clone-microservice-mongo_replica-1 mongosh --quiet --port 27018 -u admin -p password --authenticationDatabase admin --eval "rs.status().members.filter(m=>m.stateStr=='PRIMARY').map(m=>m.name).join()"`);
        if (stdout.trim()) electionMs = Date.now() - T0 - stopAt + ' ms (new primary: ' + stdout.trim() + ')';
      } catch {}
      await sleep(1000);
    }
  })();
}
await sleep(F.downMs);
await sh(F.start); startAt = Date.now() - T0;
await sleep(25000);
endProbe = true; await loop;

const gw = { 8008: await portUp(8008), 8009: await portUp(8009) };
const rel = (t) => t - stopAt;
const failures = (k) => series.filter((s) => !s[k].ok);
const firstFail = (k) => { const f = failures(k)[0]; return f ? rel(f.t) : null; };
const firstOkAfterStart = (k) => { const s = series.find((x) => x.t >= startAt && x[k].ok); return s ? s.t + s[k].ms - startAt : null; };
const summary = {
  fault: which, stopped_at_s: (stopAt / 1000).toFixed(1), down_for_s: F.downMs / 1000,
  per_probe: Object.fromEntries(['warm', 'cold', 'send'].map((k) => [k, {
    failed_samples: failures(k).length + '/' + series.length,
    first_failure_after_kill_ms: firstFail(k),
    slowest_ms: Math.max(...series.map((s) => s[k].ms)),
    recovered_after_start_ms: firstOkAfterStart(k),
  }])),
  election: electionMs, gateways_alive_after: gw,
};
console.log(JSON.stringify(summary, null, 2));
console.log('timeline (t rel. to kill: warm/cold/send):');
console.log(series.filter((s) => s.t >= stopAt - 1500).map((s) => `${(rel(s.t) / 1000).toFixed(1)}s ${s.warm.ok ? 'ok' : 'FAIL'}(${s.warm.ms}) ${s.cold.ok ? 'ok' : 'FAIL'}(${s.cold.ms}) ${s.send.ok ? 'ok' : 'FAIL'}(${s.send.ms})`).join('\n'));

if (!gw[8008]) { console.log('restoring gateway 8008:', await startGateway(8008), 'ms'); }
if (!gw[8009]) { console.log('restoring gateway 8009:', await startGateway(8009), 'ms'); }
try { a?.socket.close(); } catch {}
process.exit(0);
