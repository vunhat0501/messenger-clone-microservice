// Samples RSS of the Node backend processes and docker container CPU/memory every INTERVAL seconds.
// node sample_resources.mjs <seconds-total> [interval=15] -> report/ket-qua/p6_resources.csv
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const total = Number(process.argv[2] || 60);
const interval = Number(process.argv[3] || 15) * 1000;
const out = `${import.meta.dirname}/../ket-qua/p6_resources.csv`;
fs.mkdirSync(`${import.meta.dirname}/../ket-qua`, { recursive: true });
if (!fs.existsSync(out)) fs.writeFileSync(out, 'time,kind,name,cpu_percent,mem_mb\n');
const label = (cmd, port) => /auth-service/.test(cmd) ? 'auth-service' : /chat-service/.test(cmd) ? 'chat-service' : /dist.apps.api/.test(cmd) ? `gateway-${port || '?'}` : null;
function sampleNode() {
  const lines = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${import.meta.dirname}/node_procs.ps1"`).toString().trim().split(/\r?\n/).filter(Boolean);
  const listen = execSync('netstat -ano').toString();
  return lines.map((l) => { const [pid, mb, ...cmd] = l.split('|'); const m = listen.split(/\r?\n/).find((x) => /LISTENING/.test(x) && x.trim().endsWith(' ' + pid) && /:(8008|8009)\s/.test(x)); const port = m && m.match(/:(8008|8009)\s/)[1]; return { name: label(cmd.join('|'), port), mb }; }).filter((x) => x.name);
}
const t0 = Date.now();
while (Date.now() - t0 < total * 1000) {
  const now = new Date().toISOString();
  let rows = [];
  try { rows = sampleNode().map((x) => `${now},process,${x.name},,${x.mb}`); } catch {}
  try {
    const st = execSync('docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"').toString().trim().split(/\r?\n/);
    for (const l of st) { const [n, cpu, mem] = l.split('|'); const used = mem.split('/')[0].trim(); const mb = /GiB/.test(used) ? parseFloat(used) * 1024 : parseFloat(used); rows.push(`${now},container,${n},${parseFloat(cpu)},${mb.toFixed(1)}`); }
  } catch {}
  fs.appendFileSync(out, rows.join('\n') + '\n');
  await new Promise((r) => setTimeout(r, interval));
}
