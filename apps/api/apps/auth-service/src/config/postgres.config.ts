import { registerAs } from '@nestjs/config';
import { env } from 'apps/api/src/config/env.config';
import { resolvePostgresTopology } from 'apps/auth-service/src/database/pg-topology.resolver';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export default registerAs(
  'postgres',
  async (): Promise<PostgresConnectionOptions> => {
    const candidateUrls = [
      env.DATABASE_URL,
      env.DATABASE_REPLICA_URL,
      env.DATABASE_REPLICA_2_URL,
    ].filter((u): u is string => typeof u === 'string' && u.length > 0);

    const topology = await resolvePostgresTopology(candidateUrls);
    const slaves = topology.slaveUrls.map((url) => ({ url }));

    return {
      type: 'postgres',
      ...(slaves.length > 0
        ? {
            replication: {
              master: { url: topology.masterUrl },
              slaves,
              // Credentials, refresh tokens and authorization must see current data.
              defaultMode: 'master' as const,
            },
          }
        : { url: topology.masterUrl }),
      entities: [],

      //! DO NOT set to true in production
      synchronize: env.NODE_ENV !== 'production',
    };
  },
);
