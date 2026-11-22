// Kill gateway 8008 while Alice is connected to it; measure how long Bob (on 8009)
// keeps seeing Alice online. Restart 8008 afterwards by touching a gateway source file
// (the `nest start --watch` in `pnpm --filter api dev` rebuilds and restarts it).
import fs from 'node:fs';
import { login, connect, sleep } from './lib.mjs';
import { getPid, portUp } from './ops.mjs';

const alice = await login('alice', 'http://localhost:8008');
const bob = await login('bob', 'http://localhost:8009');

const b = await connect('http://localhost:8009', bob.token, 'bob');
const a = await connect('http://localhost:8008', alice.token, 'alice');
await sleep(500);

const aliceId = String(alice.id);
let offlineAt = null;
b.socket.on('userStatusChanged', ({ userId, status }) => {
  if (String(userId) === aliceId && status === 'offline' && !offlineAt) offlineAt = Date.now();
});
const onlineNow = await new Promise((res) =>
  b.socket.timeout(3000).emit('getOnlineUsers', (err, ids) => res(err ? null : ids)),
);
console.log('before kill, Bob sees Alice online:', onlineNow?.map(String).includes(aliceId));

const pid = getPid(8008);
const killedAt = Date.now();
process.kill(pid); // hard kill: the gateway gets no chance to run handleDisconnect
console.log('killed gateway 8008, pid', pid);

while (!offlineAt && Date.now() - killedAt < 70_000) await sleep(250);
const after = await new Promise((res) =>
  b.socket.timeout(3000).emit('getOnlineUsers', (err, ids) => res(err ? null : ids)),
);
console.log(JSON.stringify({
  bob_received_offline_after_s: offlineAt ? ((offlineAt - killedAt) / 1000).toFixed(1) : 'never (70 s)',
  alice_in_online_list_after: after?.map(String).includes(aliceId),
}, null, 2));

a.socket.close();
b.socket.close();
const src = `${import.meta.dirname}/../../apps/api/apps/api/src/main.ts`;
fs.utimesSync(src, new Date(), new Date());
for (let i = 0; i < 80 && !(await portUp(8008)); i++) await sleep(500);
console.log('gateway 8008 back up:', await portUp(8008));
process.exit(0);
