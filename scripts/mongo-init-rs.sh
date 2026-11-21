#!/bin/bash
set -euo pipefail

mongosh --quiet --host mongo_primary:27017 --username "$MONGO_USER" \
    --password "$MONGO_PASS" --authenticationDatabase admin --file /dev/stdin <<'EOJS'
try {
    const status = rs.status();
    if (status.set !== 'rs0') throw new Error('Unexpected replica set name');
} catch (error) {
    if (error.code !== 94) throw error; // NotYetInitialized
    const result = rs.initiate({
        _id: 'rs0',
        members: [
            { _id: 0, host: 'mongo_primary:27017', priority: 2 },
            { _id: 1, host: 'mongo_replica:27017', priority: 1 },
            { _id: 2, host: 'mongo_replica_2:27017', priority: 1 },
        ],
    });
    if (!result.ok) throw new Error('Replica set initialization failed');
}
// Do not report success until a primary and readable secondaries exist.
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
    const members = rs.status().members;
    const hasPrimary = members.some(m => m.stateStr === 'PRIMARY');
    const secondaries = members.filter(m => m.stateStr === 'SECONDARY');
    if (hasPrimary && secondaries.length >= 2) {
        ready = true;
        break;
    }
    sleep(1000);
}
if (!ready) throw new Error('Replica set did not become ready within 60 seconds');
EOJS
