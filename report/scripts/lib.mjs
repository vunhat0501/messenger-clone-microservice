import { createRequire } from 'node:module';
const require = createRequire(import.meta.dirname + '/../../apps/web/package.json');
export const { io } = require('socket.io-client');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ts = () => new Date().toISOString().slice(11, 23);

export async function api(method, path, { token, body, base = 'http://localhost:80' } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, instance: res.headers.get('x-instance-id'), json };
}

export async function login(name, base) {
  const pw = { alice: 'Alice@1234', bob: 'Bob@12345' }[name];
  const r = await api('POST', '/auth/signin', { body: { email: `${name}@example.com`, password: pw }, base });
  if (r.status >= 300) throw new Error(`login ${name} failed: ${r.status}`);
  const d = r.json.data;
  return { id: d.id, token: d.accessToken, refresh: d.refreshToken };
}

export function connect(url, token, label = '') {
  return new Promise((resolve) => {
    const s = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    const info = { socket: s, url, label, connectedAt: null, instance: null, error: null };
    s.on('gatewayConnected', (d) => { info.instance = d.instanceId; });
    s.on('connect', () => { info.connectedAt = Date.now(); setTimeout(() => resolve(info), 150); });
    s.on('connect_error', (e) => { info.error = e.message; resolve(info); });
    s.on('auth_error', (e) => { info.error = 'auth_error: ' + e.message; });
    s.on('disconnect', (reason) => { info.disconnectReason = reason; });
    setTimeout(() => resolve(info), 4000);
  });
}

export async function ensureConversation(alice, bob) {
  const r = await api('POST', '/chat/conversations', { token: alice.token, body: { targetUserId: bob.id } });
  if (r.status >= 300) throw new Error('create conversation failed ' + r.status);
  return r.json.data._id;
}

export function pct(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : null;
}
