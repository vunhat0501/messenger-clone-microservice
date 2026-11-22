#!/bin/bash
# Runs the WebSocket load matrix: 3 repetitions of fanout and senders at each size.
cd "$(dirname "$0")/../.."
for rep in 1 2 3; do
  for n in 50 100 250 500; do
    for mode in fanout senders; do
      echo "[$(date +%T)] rep=$rep n=$n mode=$mode"
      timeout 180 node report/scripts/p1_ws_load.mjs $mode $n 20 2>&1 | grep -v dotenv
      sleep 5
    done
  done
done
echo "[$(date +%T)] DONE"
