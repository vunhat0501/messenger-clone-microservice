#!/bin/bash
# 30-minute soak: 100 sockets, every socket sends 0.2 msg/s (20 msg/s total), 30 windows of 55 s.
# Per-window latency goes to report/ket-qua/p7_soak.csv, resource samples to p6_resources.csv.
cd "$(dirname "$0")/../.."
export CSV="$PWD/report/ket-qua/p7_soak.csv"
node report/scripts/sample_resources.mjs 1900 15 &
SAMPLER=$!
for w in $(seq 1 30); do
  echo "[$(date +%T)] window $w"
  timeout 120 node report/scripts/p1_ws_load.mjs senders 100 55 2>&1 | grep -v dotenv | cut -c1-200
  sleep 5
done
kill $SAMPLER 2>/dev/null
echo "[$(date +%T)] DONE"
