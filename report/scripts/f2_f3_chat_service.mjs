import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { login, connect, ensureConversation, api, sleep } from './lib.mjs';

const REPO = (import.meta.dirname + '/../..');
const DIR = import.meta.dirname;
const pids = (svc) => execSync(`powershell -NoProfile -File "${DIR}/pids.ps1" ${svc}`).toString().split(/\s+/).filter(Boolean).map(Number);
const consumers = () => {
  const o = execSync('docker exec app_rabbitmq rabbitmqctl list_queues name consumers messages').toString();
  const l = o.split('\n').find((x) => x.startsWith('chat_queue'));
  const [, c, m] = l.trim().split(/\s+/);
  return { consumers: +c, messages: +m };
};
function startChat() {
  const out = fs.openSync(`${DIR}/chat-extra.log`, 'a');
  const ch = spawn('node', ['--enable-source-maps', 'dist/apps/chat-service/main'], { cwd: `${REPO}/apps/api`, detached: true, stdio: ['ignore', out, out] });
  ch.unref();
  return ch.pid;
}
async function waitConsumers(n, ms = 25000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (consumers().consumers >= n) return Date.now() - t; await sleep(500); }
  return null;
}
const coldLimit = () => 120 + Math.floor(Math.random() * 70);

const alice = await login('alice', 'http://localhost:8008');
const bob = await login('bob', 'http://localhost:8009');
const conv = await ensureConversation(alice, bob);
const a = await connect('http://localhost:8008', alice.token, 'alice');
const b = await connect('http://localhost:8009', bob.token, 'bob');
a.socket.emit('joinConversation', { conversationId: conv });
b.socket.emit('joinConversation', { conversationId: conv });
await sleep(300);

const recv = new Set();
b.socket.on('newMessage', (m) => { if (m.clientMessageId) recv.add(m.clientMessageId); });

async function storedIds(prefix) {
  const r = await api('GET', `/chat/conversations/${conv}/messages?limit=${coldLimit()}`, { token: bob.token, base: 'http://localhost:8009' });
  const ids = new Map();
  for (const m of r.json?.data || []) if (m.clientMessageId?.startsWith(prefix)) ids.set(m.clientMessageId, (ids.get(m.clientMessageId) || 0) + 1);
  return ids;
}

// ---------- F2: two chat-service instances, kill one under load ----------
const RUN2 = 'f2' + Date.now().toString(36);
const extraPid = startChat();
const upMs = await waitConsumers(2);
console.log('F2 setup: second chat-service pid', extraPid, 'consumers=2 after', upMs, 'ms');
const sent2 = new Map();
let seq = 0;
const loop2 = setInterval(() => {
  const id = `${RUN2}-${seq++}`;
  const rec = { id, t0: Date.now(), ack: null, err: null };
  sent2.set(id, rec);
  a.socket.timeout(15000).emit('sendMessage', { conversationId: conv, text: id, clientMessageId: id }, (e, saved) => {
    if (e) rec.err = 'client-timeout'; else if (saved?.error) rec.err = saved.error; else rec.ack = Date.now();
  });
}, 100);
await sleep(3000);
const tKill2 = Date.now();
process.kill(extraPid, 'SIGKILL');
await sleep(5000);
clearInterval(loop2);
await sleep(16000);
const db2 = await storedIds(RUN2);
const ids2 = [...sent2.keys()];
const f2 = {
  sent: ids2.length,
  acked_ok: ids2.filter((i) => sent2.get(i).ack).length,
  ack_errors: ids2.filter((i) => sent2.get(i).err).length,
  error_kinds: [...new Set(ids2.map((i) => sent2.get(i).err).filter(Boolean))],
  delivered_to_bob: ids2.filter((i) => recv.has(i)).length,
  stored_in_mongo: db2.size,
  duplicates_in_db: [...db2.values()].filter((c) => c > 1).length,
  acked_but_not_stored: ids2.filter((i) => sent2.get(i).ack && !db2.has(i)).length,
  stored_but_error_to_client: ids2.filter((i) => sent2.get(i).err && db2.has(i)).length,
  errors_first_after_kill_ms: Math.min(...ids2.filter((i) => sent2.get(i).err).map((i) => sent2.get(i).t0 - tKill2).filter((x) => x > -1), Infinity),
};
console.log('F2 result', JSON.stringify(f2, null, 2));

// ---------- F3: kill ALL chat-service, send, restart ----------
const RUN3 = 'f3' + Date.now().toString(36);
const killed = pids('chat-service');
for (const p of killed) { try { process.kill(p, 'SIGKILL'); } catch {} }
await sleep(1500);
const qBefore = consumers();
const tSend3 = Date.now();
const id3 = `${RUN3}-0`;
let ack3 = null;
a.socket.timeout(20000).emit('sendMessage', { conversationId: conv, text: id3, clientMessageId: id3 }, (e, saved) => { ack3 = { at: Date.now() - tSend3, err: e ? 'client-timeout' : saved?.error || null }; });
await sleep(12000);
const qDuring = consumers();
const tRestart = Date.now();
startChat();
const upMs3 = await waitConsumers(1);
await sleep(3000);
const db3 = await storedIds(RUN3);
console.log('F3 result', JSON.stringify({
  killed_pids: killed, queue_after_kill: qBefore, queue_after_12s: qDuring,
  client_saw: ack3, restarted_consumer_ms: upMs3,
  message_stored_after_restart: db3.has(id3), bob_received_realtime: recv.has(id3),
}, null, 2));
a.socket.close(); b.socket.close();
process.exit(0);
