import { registerAs } from '@nestjs/config';
import { env } from 'apps/api/src/config/env.config';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export default registerAs(
  'postgres',
  (): PostgresConnectionOptions => {
    const slaves = [
      env.DATABASE_REPLICA_URL ? { url: env.DATABASE_REPLICA_URL } : null,
      env.DATABASE_REPLICA_2_URL ? { url: env.DATABASE_REPLICA_2_URL } : null,
    ].filter((s): s is { url: string } => s !== null);

    return {
      type: 'postgres',
      ...(slaves.length > 0
        ? {
            replication: {
              master: { url: env.DATABASE_URL },
              slaves,
              // Credentials, refresh tokens and authorization must see current data.
              defaultMode: 'master' as const,
            },
          }
        : { url: env.DATABASE_URL }),
      entities: [],

      //! DO NOT set to true in production
      synchronize: env.NODE_ENV !== 'production',
    };
  },
);
