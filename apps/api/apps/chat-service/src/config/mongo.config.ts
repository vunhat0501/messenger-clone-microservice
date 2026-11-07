import { registerAs } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';
import { env } from 'apps/api/src/config/env.config';

export default registerAs(
  'mongo',
  (): MongooseModuleOptions => ({
    uri: env.MONGO_URI,
    ...(env.MONGO_REPLICA_SET ? { replicaSet: env.MONGO_REPLICA_SET } : {}),
    // Membership checks and reads used to make writes must not use stale data.
    readPreference: 'primary',
    writeConcern: { w: 'majority', wtimeoutMS: 10000 },
    retryWrites: true,
  }),
);
