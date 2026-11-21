import { login } from './lib.mjs';
const alice = await login('alice', 'http://localhost:8008');
const tally = {};
let stop = false;
const w = async () => { while (!stop) { try { const r = await fetch('http://localhost:80/chat/conversations', { headers: { authorization: `Bearer ${alice.token}` } }); await r.arrayBuffer(); const k = r.status + ' ' + (r.headers.get('x-instance-id') || 'no-instance-header'); tally[k] = (tally[k] || 0) + 1; } catch (e) { const k = 'fetch-error ' + (e.cause?.code || e.message); tally[k] = (tally[k] || 0) + 1; } } };
const ws = Array.from({ length: 100 }, w);
await new Promise((r) => setTimeout(r, 5000)); stop = true; await Promise.all(ws);
console.log(JSON.stringify(tally, null, 1)); process.exit(0);
