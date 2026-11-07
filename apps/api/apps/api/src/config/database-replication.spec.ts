import postgresConfig from '../../../auth-service/src/config/postgres.config';
import mongoConfig from '../../../chat-service/src/config/mongo.config';
import { env } from './env.config';

jest.mock('apps/api/src/config/env.config', () => ({
  env: {
    DATABASE_URL: 'postgresql://writer:password@localhost:5432/auth',
    DATABASE_REPLICA_URL: undefined,
    MONGO_URI: 'mongodb://localhost:27017/chat',
    MONGO_REPLICA_SET: undefined,
    NODE_ENV: 'production',
  },
}));

describe('database replication configuration', () => {
  afterEach(() => {
    env.DATABASE_REPLICA_URL = undefined;
    env.MONGO_REPLICA_SET = undefined;
  });

  it('uses the writer URL without overriding its credentials in standalone mode', () => {
    expect(postgresConfig()).toMatchObject({
      url: env.DATABASE_URL,
      synchronize: false,
    });
    expect(postgresConfig().replication).toBeUndefined();
    expect(postgresConfig().host).toBeUndefined();
  });

  it('keeps authentication reads and writes on the writer when a replica is configured', () => {
    env.DATABASE_REPLICA_URL =
      'postgresql://reader:password@localhost:5433/auth';
    expect(postgresConfig().replication).toEqual({
      master: { url: env.DATABASE_URL },
      slaves: [{ url: env.DATABASE_REPLICA_URL }],
      defaultMode: 'master',
    });
  });

  it('uses primary MongoDB reads for membership checks and majority writes', () => {
    env.MONGO_REPLICA_SET = 'rs0';
    expect(mongoConfig()).toMatchObject({
      uri: env.MONGO_URI,
      replicaSet: 'rs0',
      readPreference: 'primary',
      writeConcern: { w: 'majority', wtimeoutMS: 10000 },
      retryWrites: true,
    });
  });

  it('preserves hosted or standalone MongoDB discovery when unset', () => {
    expect(mongoConfig().replicaSet).toBeUndefined();
  });
});
