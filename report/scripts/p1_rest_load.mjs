import fs from 'node:fs';
import { login, ensureConversation, pct } from './lib.mjs';

const DIR = import.meta.dirname;
const alice = await login('alice', 'http://localhost:8008');
const bob = await login('bob', 'http://localhost:8009');
const conv = await ensureConversation(alice, bob);

async function load({ name, urlFn, concurrency, seconds }) {
  const lat = []; let errors = 0; let stop = false; const perInstance = {};
  const worker = async () => {
    while (!stop) {
      const t = performance.now();
      try {
        const r = await fetch(urlFn(), { headers: { authorization: `Bearer ${alice.token}` } });
        await r.arrayBuffer();
        const inst = r.headers.get('x-instance-id') || '?';
        perInstance[inst] = (perInstance[inst] || 0) + 1;
        if (r.status === 200) lat.push(performance.now() - t); else errors++;
      } catch { errors++; }
    }
  };
  const t0 = performance.now();
  const ws = Array.from({ length: concurrency }, worker);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  stop = true; await Promise.all(ws);
  const dur = (performance.now() - t0) / 1000;
  const f = (x) => Math.round(x * 10) / 10;
  return { name, concurrency, rps: Math.round(lat.length / dur), p50: f(pct(lat, 50)), p95: f(pct(lat, 95)), p99: f(pct(lat, 99)), errors, perInstance };
}

const results = [];
const secs = 8;
const configs = [
  { name: 'GET /chat/conversations, 1 gateway (8008)', urlFn: () => 'http://localhost:8008/chat/conversations' },
  { name: 'GET /chat/conversations, Nginx -> 2 gateways', urlFn: () => 'http://localhost:80/chat/conversations' },
];
for (const c of configs) for (const n of [10, 50, 100, 250]) { const r = await load({ ...c, concurrency: n, seconds: secs }); results.push(r); console.log(JSON.stringify(r)); }

// cache effect: same endpoint, warm key vs forced-miss keys (distinct limit each request)
let k = 0;
for (const n of [50]) {
  const warm = await load({ name: 'messages limit=100 (cache hit)', urlFn: () => `http://localhost:8008/chat/conversations/${conv}/messages?limit=100`, concurrency: n, seconds: secs });
  const cold = await load({ name: 'messages distinct limit (cache miss)', urlFn: () => `http://localhost:8008/chat/conversations/${conv}/messages?limit=${100 + (k++ % 100000)}`, concurrency: n, seconds: secs });
  results.push(warm, cold); console.log(JSON.stringify(warm)); console.log(JSON.stringify(cold));
}
fs.writeFileSync(`${DIR}/p1_results.json`, JSON.stringify(results, null, 2));
process.exit(0);
