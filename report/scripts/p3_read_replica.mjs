// Read-path load with the cache bypassed (a distinct `limit` per request). Usage: node p3_read_replica.mjs <label> [concurrency=50] [seconds=15]
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { login, ensureConversation, pct } from './lib.mjs';

const label = process.argv[2] || 'unknown';
const concurrency = Number(process.argv[3] || 50);
const seconds = Number(process.argv[4] || 15);
const alice = await login('alice', 'http://localhost:8008');
const bob = await login('bob', 'http://localhost:8008');
const conv = await ensureConversation(alice, bob);

let k = 0, stop = false, errors = 0;
const lat = [];
const worker = async () => {
  while (!stop) {
    const t = performance.now();
    try {
      const r = await fetch(`http://localhost:8008/chat/conversations/${conv}/messages?limit=${300 + (k++ % 100000)}`, { headers: { authorization: `Bearer ${alice.token}` } });
      await r.arrayBuffer();
      r.status === 200 ? lat.push(performance.now() - t) : errors++;
    } catch { errors++; }
  }
};
const t0 = performance.now();
const workers = Array.from({ length: concurrency }, worker);
await new Promise((r) => setTimeout(r, (seconds / 2) * 1000));
const stats = execSync('docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}"').toString().split(/\r?\n/).filter((l) => /mongo|chat_mongo/.test(l));
await new Promise((r) => setTimeout(r, (seconds / 2) * 1000));
stop = true; await Promise.all(workers);
const dur = (performance.now() - t0) / 1000;
const cpu = (needle) => parseFloat((stats.find((l) => l.includes(needle)) || '|0').split('|')[1]);
const f = (x) => Math.round(x * 10) / 10;
const row = { read_preference: label, concurrency, seconds, rps: Math.round(lat.length / dur), p50_ms: f(pct(lat, 50)), p95_ms: f(pct(lat, 95)), p99_ms: f(pct(lat, 99)), errors,
  cpu_primary_node: cpu('chat_mongo'), cpu_replica_node: cpu('mongo_replica-1'), cpu_replica2_node: cpu('mongo_replica_2') };
console.log(JSON.stringify(row));
const out = `${import.meta.dirname}/../ket-qua/p3_read_replica.csv`;
if (!fs.existsSync(out)) fs.writeFileSync(out, Object.keys(row).join(',') + '\n');
fs.appendFileSync(out, Object.values(row).join(',') + '\n');
process.exit(0);
