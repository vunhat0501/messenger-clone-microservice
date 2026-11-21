import { registerAs } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';
import { env } from 'apps/api/src/config/env.config';
import { resolveMongoTopology } from 'apps/chat-service/src/database/mongo-topology.resolver';

export default registerAs(
  'mongo',
  async (): Promise<MongooseModuleOptions> => {
    const candidateUris = [
      env.MONGO_URI,
      env.MONGO_REPLICA_URL,
      env.MONGO_REPLICA_2_URL,
    ].filter((u): u is string => typeof u === 'string' && u.length > 0);

    const topology = await resolveMongoTopology(candidateUris);

    return {
      uri: topology.primaryUri,
      ...(env.MONGO_REPLICA_SET ? { replicaSet: env.MONGO_REPLICA_SET } : {}),
      // Membership checks and reads used to make writes must not use stale data.
      readPreference: 'primary',
      writeConcern: { w: 'majority', wtimeoutMS: 10000 },
      retryWrites: true,
    };
  },
);
