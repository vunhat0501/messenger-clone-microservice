#!/bin/bash
# Faults under load: 250 sockets, every socket sends 0.2 msg/s for 60 s with reconnection enabled.
# ONLY="label1 label2" runs just those scenarios.
# At t=20 s one component is killed, at t=35 s it is restarted (touching a file wakes the watcher).
cd "$(dirname "$0")/../.."
export CSV="$PWD/report/ket-qua/p8_faults_under_load.csv" RECONNECT=1
kill_port() { powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort $1 -State Listen | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"; }
kill_chat() { powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'dist.apps.chat-service' -and \$_.CommandLine -notmatch 'nest.js|concurrently' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"; }
wait_ready() { for i in $(seq 1 60); do sleep 3; c=$(docker exec app_rabbitmq rabbitmqctl list_queues name consumers 2>/dev/null | awk '$1=="chat_queue"{print $2}'); a=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 localhost:8008/); b=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 localhost:8009/); [ "${c:-0}" = "1" ] && [ "$a" = 200 ] && [ "$b" = 200 ] && return 0; done; return 1; }
run() {
  label="$1"; kill_cmd="$2"; restart_cmd="$3"
  if [ -n "$ONLY" ] && [[ " $ONLY " != *" $label "* ]]; then return; fi
  echo "[$(date +%T)] $label"
  ( LABEL="$label" timeout 150 node report/scripts/p1_ws_load.mjs senders 250 60 2>&1 | grep -v dotenv | cut -c1-400 ) &
  LOAD=$!
  sleep 30   # connection ramp-up (~10 s) + 20 s of steady load
  eval "$kill_cmd"; echo "[$(date +%T)] killed"
  sleep 15
  eval "$restart_cmd"; echo "[$(date +%T)] restarted"
  wait $LOAD
  wait_ready || echo "WARNING: system not ready after $label"
  sleep 5
}
run "baseline-no-fault" "true" "true"
run "kill-gateway-8009" "kill_port 8009" "touch apps/api/dist/apps/api/main.js"
run "kill-chat-service" "kill_chat" "touch apps/api/apps/chat-service/src/main.ts"
run "redis-down-15s" "docker kill app_redis" "docker start app_redis"
run "rabbitmq-down-15s" "docker kill app_rabbitmq" "docker start app_rabbitmq"
run "rabbitmq-partition-15s" "docker network disconnect messenger-clone-microservice_default app_rabbitmq" "docker network connect --alias rabbitmq messenger-clone-microservice_default app_rabbitmq"
run "mongo-primary-kill-15s" "docker kill chat_mongo" "docker start chat_mongo"
echo "[$(date +%T)] DONE"
