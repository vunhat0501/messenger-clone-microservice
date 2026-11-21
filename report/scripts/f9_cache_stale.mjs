import { login, ensureConversation, api, sleep } from './lib.mjs';

const base = 'http://localhost:8008';
const alice = await login('alice', base);
const bob = await login('bob', base);
const conv = await ensureConversation(alice, bob);
const get = async (limit) => (await api('GET', `/chat/conversations/${conv}/messages?limit=${limit}`, { token: bob.token, base })).json?.data || [];
const send = async (text) => {
  const r = await api('POST', `/chat/conversations/${conv}/messages`, { token: alice.token, base, body: { text, clientMessageId: `f9-${Date.now()}-${Math.random()}` } });
  if (r.status >= 300) { console.log('SEND FAILED', r.status, JSON.stringify(r.json).slice(0, 120)); process.exit(2); }
  return r;
};
const has = (arr, text) => arr.some((m) => m.text === text);

// A: the cache key that IS invalidated on write (limit=100)
const tagA = 'cacheA-' + Date.now();
await get(100);
await send(tagA);
const a2 = await get(100);
console.log('A) limit=100  read -> write -> read immediately: new message visible =', has(a2, tagA));

// B: a cache key that is NOT invalidated on write (any other limit)
const L = 60 + Math.floor(Math.random() * 30);
const tagB = 'cacheB-' + Date.now();
const t0 = Date.now();
await get(L);
await send(tagB);
let visibleAfter = null;
for (let i = 0; i < 16; i++) {
  const arr = await get(L);
  if (has(arr, tagB)) { visibleAfter = Date.now() - t0; break; }
  await sleep(5000);
}
console.log(`B) limit=${L}  read -> write -> poll every 5 s: new message became visible after`, visibleAfter === null ? '>80 s' : (visibleAfter / 1000).toFixed(1) + ' s (cache TTL is 60 s)');

// C: conversation list (invalidated on write)
const tagC = 'cacheC-' + Date.now();
await api('GET', '/chat/conversations', { token: bob.token, base });
await send(tagC);
const list = (await api('GET', '/chat/conversations', { token: bob.token, base })).json?.data || [];
console.log('C) conversation list after a write: snippet is fresh =', list.some((c) => c.lastMessageSnippet === tagC));
process.exit(0);
