#!/bin/bash
set -euo pipefail

mongosh --quiet --host mongo_primary:27017 --username "$MONGO_USER" \
    --password "$MONGO_PASS" --authenticationDatabase admin --file /dev/stdin <<'EOJS'
const desiredMembers = [
    { _id: 0, host: 'mongo_primary:27017', priority: 2 },
    { _id: 1, host: 'mongo_replica:27018', priority: 1 },
    { _id: 2, host: 'mongo_replica_2:27019', priority: 1 },
];

try {
    const status = rs.status();
    if (status.set !== 'rs0') throw new Error('Unexpected replica set name');
} catch (error) {
    if (error.code !== 94) throw error; // NotYetInitialized
    const result = rs.initiate({ _id: 'rs0', members: desiredMembers });
    if (!result.ok) throw new Error('Replica set initialization failed');
}

const config = rs.conf();
const hostsDiffer = desiredMembers.some(
    m => config.members.find(c => c._id === m._id)?.host !== m.host,
);
if (hostsDiffer) {
    config.members = config.members.map(c => {
        const desired = desiredMembers.find(m => m._id === c._id);
        return desired ? { ...c, host: desired.host } : c;
    });
    config.version += 1;
    try {
        rs.reconfig(config);
    } catch (error) {
        print(`Normal reconfig failed (${error.message}); forcing it on mongo_primary`);
        rs.reconfig(config, { force: true });
    }
    print('Replica set members renamed to ' + desiredMembers.map(m => m.host).join(', '));
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
