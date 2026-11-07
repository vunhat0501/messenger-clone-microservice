import { registerAs } from '@nestjs/config';
import { env } from 'apps/api/src/config/env.config';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export default registerAs(
  'postgres',
  (): PostgresConnectionOptions => ({
    type: 'postgres',
    ...(env.DATABASE_REPLICA_URL
      ? {
          replication: {
            master: { url: env.DATABASE_URL },
            slaves: [{ url: env.DATABASE_REPLICA_URL }],
            // Credentials, refresh tokens and authorization must see current data.
            defaultMode: 'master' as const,
          },
        }
      : { url: env.DATABASE_URL }),
    entities: [],

    //! DO NOT set to true in production
    synchronize: env.NODE_ENV !== 'production',
  }),
);
