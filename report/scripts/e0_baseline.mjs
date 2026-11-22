import { login, connect, ensureConversation, sleep, ts, pct } from './lib.mjs';

const N = Number(process.argv[2] || 30);
const alice = await login('alice', 'http://localhost:8008');
const bob = await login('bob', 'http://localhost:8009');
const conv = await ensureConversation(alice, bob);
console.log(ts(), 'conversation', conv);

const a = await connect('http://localhost:8008', alice.token, 'alice');
const b = await connect('http://localhost:8009', bob.token, 'bob');
console.log(ts(), 'alice ->', a.instance || a.error, '| bob ->', b.instance || b.error);

a.socket.emit('joinConversation', { conversationId: conv });
b.socket.emit('joinConversation', { conversationId: conv });
await sleep(300);

const pending = new Map();
b.socket.on('newMessage', (m) => {
  const t0 = pending.get(m.clientMessageId);
  if (t0 !== undefined) { pending.delete(m.clientMessageId); m._lat = performance.now() - t0; lat.push(m._lat); }
});
const lat = [];
const ackLat = [];
let errors = 0;
for (let i = 0; i < N; i++) {
  const id = `e0-${Date.now()}-${i}`;
  const t0 = performance.now();
  pending.set(id, t0);
  await new Promise((res) => {
    a.socket.timeout(10000).emit('sendMessage', { conversationId: conv, text: `baseline ${i}`, clientMessageId: id }, (err, saved) => {
      if (err || saved?.error) errors++; else ackLat.push(performance.now() - t0);
      res();
    });
  });
  await sleep(50);
}
await sleep(500);
const f = (x) => (x === null ? 'n/a' : x.toFixed(1) + ' ms');
console.log(JSON.stringify({
  sent: N, delivered_to_bob: lat.length, lost: N - lat.length, errors,
  cross_gateway_latency: { p50: f(pct(lat, 50)), p95: f(pct(lat, 95)), max: f(Math.max(...lat)) },
  ack_latency_alice: { p50: f(pct(ackLat, 50)), p95: f(pct(ackLat, 95)) },
}, null, 2));
a.socket.close(); b.socket.close();
process.exit(0);
