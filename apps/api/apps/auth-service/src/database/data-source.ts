import { env } from '@/config/env.config';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';

const options: DataSourceOptions & SeederOptions = {
  type: 'postgres',
  url: env.DATABASE_URL,

  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,

  entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, './migrations/postgres/*{.ts,.js}')],
  factories: ['src/database/factories/*{.ts,.js}'],
  // seeds: ['src/database/seeds/postgres.seeder{.ts,.js}'],

  //! DO NOT set synchronize to true in production
  synchronize: false,
  logging: true,
};

export default new DataSource(options);
