import { login, connect, ensureConversation, api, sleep, pct } from './lib.mjs';
import { getPid, startGateway, redis } from './ops.mjs';

const RUN = 'f1' + Date.now().toString(36);
const alice = await login('alice', 'http://localhost:8008');
const bob = await login('bob', 'http://localhost:8009');
const conv = await ensureConversation(alice, bob);

let a = await connect('http://localhost:8008', alice.token, 'alice');
const b = await connect('http://localhost:8009', bob.token, 'bob');
a.socket.emit('joinConversation', { conversationId: conv });
b.socket.emit('joinConversation', { conversationId: conv });
await sleep(300);

const events = [];
const T = { kill: 0 };
const ev = (name) => events.push({ name, at: Date.now() });

const sent = new Map();
const recv = new Map();
b.socket.on('newMessage', (m) => {
  if (m.clientMessageId?.startsWith(RUN)) recv.set(m.clientMessageId, (recv.get(m.clientMessageId) || 0) + 1);
});

let cur = a;
let seq = 0;
let switching = false;

function emitTracked(sock, rec) {
  sock.socket.timeout(1500).emit('sendMessage', { conversationId: conv, text: rec.id, clientMessageId: rec.id }, (err, saved) => {
    if (!err && saved && !saved.error && !rec.ack) { rec.ack = Date.now(); rec.via = sock.instance; if (T.killed && !T.firstAckAfter) { T.firstAckAfter = rec.ack; ev('first ack after kill (' + sock.instance + ')'); } }
  });
}

a.socket.on('disconnect', async (reason) => {
  if (switching) return;
  switching = true;
  T.disc = Date.now(); ev('alice socket disconnected: ' + reason);
  const n = await connect('http://localhost:8009', alice.token, 'alice-gw2');
  T.reconnected = Date.now(); ev('alice connected to ' + (n.instance || n.error));
  if (n.error) return;
  n.socket.emit('joinConversation', { conversationId: conv });
  cur = n; a = n; switching = false;
  for (const rec of sent.values()) if (!rec.ack) { rec.tries++; emitTracked(cur, rec); }
});

const loop = setInterval(() => {
  if (switching || !cur.socket.connected) return;
  const rec = { id: `${RUN}-${seq++}`, t0: Date.now(), ack: null, tries: 1 };
  sent.set(rec.id, rec);
  emitTracked(cur, rec);
}, 100);

const pid = getPid(8008);
await sleep(3000);
T.kill = Date.now(); T.killed = true; ev('KILL gateway-8008 (pid ' + pid + ')');
process.kill(pid, 'SIGKILL');
await sleep(6000);
clearInterval(loop);
await sleep(2500);

// persistence check via REST (Bob, through the surviving gateway)
const msgs = await api('GET', `/chat/conversations/${conv}/messages?limit=1000`, { token: bob.token, base: 'http://localhost:8009' });
const stored = (msgs.json?.data || []).filter((m) => m.clientMessageId?.startsWith(RUN));
const storedIds = new Map();
for (const m of stored) storedIds.set(m.clientMessageId, (storedIds.get(m.clientMessageId) || 0) + 1);

const aliceSockets = redis(`zrange presence:sockets:${alice.id} 0 -1`).split(/\r?\n/).filter(Boolean);
const onlineAlice = redis('smembers presence:online_users').includes(alice.id);
const orphan = a.socket.id ? aliceSockets.filter((s) => s !== a.socket.id) : aliceSockets;

const uniq = [...sent.keys()];
const acked = uniq.filter((id) => sent.get(id).ack);
const lostForBob = uniq.filter((id) => !recv.has(id));
const dupForBob = [...recv.values()].filter((c) => c > 1).length;
const dupInDb = [...storedIds.values()].filter((c) => c > 1).length;
const retried = uniq.filter((id) => sent.get(id).tries > 1);

const rel = (t) => (t ? `${t - T.kill >= 0 ? '+' : ''}${t - T.kill} ms` : 'n/a');
console.log(JSON.stringify({
  timeline_vs_kill: events.map((e) => `${rel(e.at)}  ${e.name}`),
  detection_ms: T.disc ? T.disc - T.kill : null,
  reconnect_ms: T.reconnected ? T.reconnected - T.kill : null,
  first_ack_after_kill_ms: T.firstAckAfter ? T.firstAckAfter - T.kill : null,
  messages: {
    sent_unique: uniq.length, acked: acked.length, stored_in_mongo: storedIds.size,
    received_by_bob: recv.size, lost_for_bob: lostForBob.length, duplicates_bob: dupForBob,
    duplicates_in_db: dupInDb, retried_with_same_clientMessageId: retried.length,
  },
  presence: { alice_in_online_set: onlineAlice, alice_sockets_in_redis: aliceSockets.length, orphan_sockets: orphan.length },
}, null, 2));

a.socket.close(); b.socket.close();
const ms = await startGateway(8008);
console.log('gateway-8008 restored in', ms, 'ms');
process.exit(0);
