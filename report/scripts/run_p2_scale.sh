#!/bin/bash
# Scale-out experiment: 500 sockets, every socket sends 0.2 msg/s, 3 repetitions per configuration.
# Configurations: gateways {1,2} x chat-service instances {1,2}. Writes report/ket-qua/p2_scale.csv.
cd "$(dirname "$0")/../.."
export CSV="$PWD/report/ket-qua/p2_scale.csv"
EXTRA_PID=""
start_extra_chat() {
  (cd apps/api && nohup node --enable-source-maps dist/apps/chat-service/main > "$OLDPWD/report/ket-qua/p2_extra_chat.log" 2>&1 & echo $! > /tmp/p2_extra_chat.pid)
  sleep 6
}
stop_extra_chat() {
  [ -f /tmp/p2_extra_chat.pid ] && powershell -NoProfile -Command "Stop-Process -Id $(cat /tmp/p2_extra_chat.pid) -Force -ErrorAction SilentlyContinue"; rm -f /tmp/p2_extra_chat.pid
}
for chat in 1 2; do
  [ "$chat" = 2 ] && start_extra_chat
  for gw in "http://localhost:8008" "http://localhost:8008,http://localhost:8009"; do
    for rep in 1 2 3; do
      echo "[$(date +%T)] chat=$chat gateways=$(echo $gw | tr ',' ' ' | wc -w) rep=$rep"
      GATEWAYS="$gw" timeout 180 node report/scripts/p1_ws_load.mjs senders 500 20 2>&1 | grep -v dotenv \
        | sed "s/^/{\"chat_instances\":$chat,\"gateways\":$(echo $gw | tr ',' '\n' | wc -l)} /"
      sleep 5
    done
  done
  [ "$chat" = 2 ] && stop_extra_chat
done
echo "[$(date +%T)] DONE"
