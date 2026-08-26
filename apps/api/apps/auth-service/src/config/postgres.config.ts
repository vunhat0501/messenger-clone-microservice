import { registerAs } from '@nestjs/config';
import { env } from 'apps/api/src/config/env.config';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export default registerAs(
  'postgres',
  (): PostgresConnectionOptions => ({
    type: 'postgres',
    url: env.DATABASE_URL,

    //** Fallbacks in case develop locally or the db url is missing */
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASS,
    database: env.DB_NAME,
    entities: [],

    //! DO NOT set to true in production
    synchronize: env.NODE_ENV !== 'production',
  }),
);
