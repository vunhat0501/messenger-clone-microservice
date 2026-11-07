jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
}));
jest.mock('dotenv', () => ({
  config: jest.fn(() => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://localhost/auth',
      MONGO_URI: 'mongodb://localhost/chat',
      RABBITMQ_URL: 'amqp://localhost',
      REDIS_URL: 'redis://localhost',
    });
  }),
}));

import { envSchema } from './env.config';

describe('replication environment validation', () => {
  const base = {
    DATABASE_URL: 'postgresql://localhost/auth',
    MONGO_URI: 'mongodb://localhost/chat',
    RABBITMQ_URL: 'amqp://localhost',
    REDIS_URL: 'redis://localhost',
  };

  it('accepts a MongoDB seed list and PostgreSQL reader URL', () => {
    const result = envSchema.parse({
      ...base,
      DATABASE_REPLICA_URL: 'postgresql://localhost:5433/auth',
      MONGO_URI:
        'mongodb://user:password@mongo_primary:27017,mongo_replica:27017/chat?authSource=admin',
      MONGO_REPLICA_SET: 'rs0',
      PG_REPL_PASSWORD: 'test-only-password',
    });
    expect(result.MONGO_REPLICA_SET).toBe('rs0');
    expect(result.MONGO_READ_PREFERENCE).toBe('secondaryPreferred');
  });

  it.each([
    { DATABASE_REPLICA_URL: 'invalid' },
    { MONGO_URI: 'https://localhost/chat' },
    { MONGO_REPLICA_SET: '' },
    { MONGO_READ_PREFERENCE: 'invalid' },
    { PG_REPL_USER: 'unsafe user' },
    { PG_REPL_PASSWORD: '' },
  ])('rejects invalid replication settings: %j', (settings) => {
    expect(envSchema.safeParse({ ...base, ...settings }).success).toBe(false);
  });

  it('keeps replication optional for hosted databases', () => {
    expect(envSchema.parse(base).DATABASE_REPLICA_URL).toBeUndefined();
  });
});
