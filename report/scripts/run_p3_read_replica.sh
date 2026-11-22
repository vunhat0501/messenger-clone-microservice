#!/bin/bash
# Compares MONGO_READ_PREFERENCE primary vs secondaryPreferred. Edits .env and restarts chat-service via the watcher,
# then ALWAYS restores the original value. Needs the backend running with chat-service in watch mode.
cd "$(dirname "$0")/../.."
ORIGINAL=$(grep -E "^MONGO_READ_PREFERENCE=" .env | cut -d= -f2)
restore() { sed -i "s/^MONGO_READ_PREFERENCE=.*/MONGO_READ_PREFERENCE=$ORIGINAL/" .env; touch apps/api/apps/chat-service/src/main.ts; echo "[$(date +%T)] restored MONGO_READ_PREFERENCE=$ORIGINAL"; }
trap restore EXIT
wait_chat() { for i in $(seq 1 40); do sleep 3; c=$(docker exec app_rabbitmq rabbitmqctl list_queues name consumers 2>/dev/null | awk '$1=="chat_queue"{print $2}'); [ "${c:-0}" = "1" ] && return 0; done; return 1; }
for pref in primary secondaryPreferred primary secondaryPreferred; do
  sed -i "s/^MONGO_READ_PREFERENCE=.*/MONGO_READ_PREFERENCE=$pref/" .env
  touch apps/api/apps/chat-service/src/main.ts; sleep 8; wait_chat || { echo "chat-service did not come back"; exit 1; }
  sleep 5
  for rep in 1 2 3; do echo "[$(date +%T)] $pref rep=$rep"; timeout 90 node report/scripts/p3_read_replica.mjs $pref 50 15 2>&1 | grep -v dotenv; done
done
