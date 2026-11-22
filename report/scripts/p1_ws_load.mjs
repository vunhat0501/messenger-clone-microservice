// WebSocket load: node p1_ws_load.mjs <fanout|senders> <sockets> <seconds> [rate]
//  fanout : N sockets join one conversation, one sender sends `rate` msg/s (default 5).
//  senders: N sockets join one conversation, each sends `rate` msg/s (default 0.2).
// Every message carries a unique clientMessageId prefixed "load-" so it can be cleaned up afterwards.
import fs from 'node:fs';
import { login, connect, ensureConversation, sleep, pct } from './lib.mjs';

const [mode = 'fanout', nArg = '50', secArg = '20', rateArg] = process.argv.slice(2);
const N = Number(nArg);
const SECONDS = Number(secArg);
const RATE = Number(rateArg ?? (mode === 'fanout' ? 5 : 0.2));
const GATEWAYS = (process.env.GATEWAYS || 'http://localhost:8008,http://localhost:8009').split(',');

const alice = await login('alice', GATEWAYS[0]);
const bob = await login('bob', GATEWAYS[0]);
const conv = await ensureConversation(alice, bob);

// Ramp up connections in small batches so the handshake itself is not the bottleneck.
const sockets = [];
let connectFailures = 0;
for (let i = 0; i < N; i += 20) {
  const batch = [];
  for (let j = i; j < Math.min(N, i + 20); j++) {
    const user = j % 2 === 0 ? alice : bob;
    batch.push(connect(GATEWAYS[j % GATEWAYS.length], user.token, `u${j}`));
  }
  const res = await Promise.all(batch);
  for (const r of res) (r.socket.connected ? sockets.push(r) : connectFailures++);
  await sleep(100);
}
for (const s of sockets) s.socket.emit('joinConversation', { conversationId: conv });
await sleep(500);

const sentAt = new Map();
const deliveryLatency = [];
let deliveries = 0;
for (const s of sockets) {
  s.socket.on('newMessage', (m) => {
    const t0 = sentAt.get(m.clientMessageId);
    if (t0 === undefined) return;
    deliveries++;
    deliveryLatency.push(performance.now() - t0);
  });
}

const ackLatency = [];
let sent = 0, ackErrors = 0;
const senders = mode === 'fanout' ? sockets.slice(0, 1) : sockets;
const t0Run = performance.now();
const timers = senders.map((s, idx) => {
  const interval = 1000 / RATE;
  return (async () => {
    await sleep(Math.random() * interval); // spread senders out
    while (performance.now() - t0Run < SECONDS * 1000) {
      const id = `load-${Date.now()}-${idx}-${sent}`;
      const t0 = performance.now();
      sentAt.set(id, t0);
      sent++;
      s.socket.timeout(10000).emit('sendMessage', { conversationId: conv, text: id, clientMessageId: id }, (err, saved) => {
        if (err || saved?.error) ackErrors++; else ackLatency.push(performance.now() - t0);
      });
      await sleep(interval);
    }
  })();
});
await Promise.all(timers);
await sleep(3000); // let in-flight messages land

const expected = sent * sockets.length;
const f = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const row = {
  mode, sockets_requested: N, sockets_connected: sockets.length, connect_failures: connectFailures,
  seconds: SECONDS, rate_per_sender: RATE, senders: senders.length,
  messages_sent: sent, ack_errors: ackErrors, throughput_msg_s: f(sent / SECONDS),
  deliveries_expected: expected, deliveries_received: deliveries,
  delivery_ratio: f((deliveries / Math.max(1, expected)) * 100),
  deliver_p50_ms: f(pct(deliveryLatency, 50)), deliver_p95_ms: f(pct(deliveryLatency, 95)), deliver_p99_ms: f(pct(deliveryLatency, 99)),
  ack_p50_ms: f(pct(ackLatency, 50)), ack_p95_ms: f(pct(ackLatency, 95)),
};
console.log(JSON.stringify(row));

const out = process.env.CSV || `${import.meta.dirname}/../ket-qua/p1_ws_load.csv`;
fs.mkdirSync(`${import.meta.dirname}/../ket-qua`, { recursive: true });
const header = Object.keys(row).join(',');
if (!fs.existsSync(out)) fs.writeFileSync(out, header + '\n');
fs.appendFileSync(out, Object.values(row).join(',') + '\n');
for (const s of sockets) s.socket.close();
process.exit(0);
