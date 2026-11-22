#!/bin/bash
# Latency and packet loss injected one component at a time while 100 sockets send 20 msg/s for 40 s.
cd "$(dirname "$0")/../.."
export CSV="$PWD/report/ket-qua/p9_netem.csv"
TARGETS="app_redis app_rabbitmq chat_mongo"
clear_all() { for t in $TARGETS; do report/scripts/netem.sh clear $t >/dev/null 2>&1; done; }
trap clear_all EXIT
wait_ready() { for i in $(seq 1 40); do c=$(docker exec app_rabbitmq rabbitmqctl list_queues name consumers 2>/dev/null | awk '$1=="chat_queue"{print $2}'); a=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 localhost:8008/); [ "${c:-0}" = "1" ] && [ "$a" = 200 ] && return 0; sleep 4; done; return 1; }
run() {
  label="$1"
  echo "[$(date +%T)] $label"
  LABEL="$label" timeout 150 node report/scripts/p1_ws_load.mjs senders 100 40 2>&1 | grep -v dotenv | cut -c1-420
}
run "baseline"
for t in $TARGETS; do
  for profile in "delay 100ms" "loss 5%"; do
    report/scripts/netem.sh apply $t $profile
    run "$t $profile"
    report/scripts/netem.sh clear $t
    wait_ready || echo "WARNING: not ready after $t $profile"
    sleep 10
  done
done
echo "[$(date +%T)] DONE"
