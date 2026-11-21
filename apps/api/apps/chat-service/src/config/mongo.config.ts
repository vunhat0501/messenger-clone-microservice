import { registerAs } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';
import { env } from 'apps/api/src/config/env.config';
import { createMongoHostLookup, parseMongoHostMap } from './mongo-host-map';

export default registerAs(
  'mongo',
  (): MongooseModuleOptions => ({
    uri: env.MONGO_URI,
    ...(env.MONGO_REPLICA_SET ? { replicaSet: env.MONGO_REPLICA_SET } : {}),
    ...(env.MONGO_HOST_MAP
      ? { lookup: createMongoHostLookup(parseMongoHostMap(env.MONGO_HOST_MAP)) }
      : {}),
    // Membership checks and reads used to make writes must not use stale data.
    readPreference: 'primary',
    writeConcern: { w: 'majority', wtimeoutMS: 10000 },
    retryWrites: true,
  }),
);
