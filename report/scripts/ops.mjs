import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';

const REPO = (import.meta.dirname + '/../..');
const LOGDIR = import.meta.dirname;

export function killPort(port) {
  const cmd = `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force; $_.OwningProcess }"`;
  return execSync(cmd).toString().trim();
}

export function getPid(port) {
  const cmd = `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess"`;
  return Number(execSync(cmd).toString().trim());
}

export async function portUp(port) {
  try { const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

export async function startGateway(port, waitMs = 20000) {
  const out = fs.openSync(`${LOGDIR}/gateway-${port}.log`, 'a');
  const child = spawn('node', ['dist/apps/api/main.js'], {
    cwd: `${REPO}/apps/api`,
    env: { ...process.env, PORT: String(port), INSTANCE_ID: `gateway-${port}` },
    detached: true, stdio: ['ignore', out, out],
  });
  child.unref();
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) { if (await portUp(port)) return Date.now() - t0; await new Promise((r) => setTimeout(r, 300)); }
  return null;
}

export function redis(args) {
  try { return execSync(`docker exec app_redis redis-cli ${args}`).toString().trim(); } catch (e) { return 'ERR ' + e.message; }
}
