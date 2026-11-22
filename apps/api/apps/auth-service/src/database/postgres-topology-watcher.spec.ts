import { PostgresTopologyWatcher } from './postgres-topology-watcher';
import { resolvePostgresTopology } from './pg-topology.resolver';

jest.mock('apps/api/src/config/env.config', () => ({
  env: {
    DATABASE_URL: 'postgresql://a@localhost:5432/db',
    DATABASE_REPLICA_URL: 'postgresql://b@localhost:5433/db',
    DATABASE_REPLICA_2_URL: 'postgresql://c@localhost:5434/db',
  },
}));
jest.mock('./pg-topology.resolver');

const resolve = resolvePostgresTopology as jest.Mock;

function makeDataSource() {
  return {
    isInitialized: true,
    options: {
      replication: {
        master: { url: 'postgresql://a@localhost:5432/db' },
        slaves: [{ url: 'postgresql://b@localhost:5433/db' }],
      },
    },
    destroy: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
  };
}

describe('PostgresTopologyWatcher', () => {
  it('reconnects to a newly promoted primary', async () => {
    const ds = makeDataSource();
    resolve.mockResolvedValue({
      masterUrl: 'postgresql://b@localhost:5433/db',
      slaveUrls: ['postgresql://c@localhost:5434/db'],
      primaryDetected: true,
    });

    const changed = await new PostgresTopologyWatcher(ds as any).check();

    expect(changed).toBe(true);
    expect(ds.destroy).toHaveBeenCalled();
    expect(ds.initialize).toHaveBeenCalled();
    expect(ds.options.replication.master.url).toBe(
      'postgresql://b@localhost:5433/db',
    );
  });

  it('does nothing while the primary is unchanged', async () => {
    const ds = makeDataSource();
    resolve.mockResolvedValue({
      masterUrl: 'postgresql://a@localhost:5432/db',
      slaveUrls: [],
      primaryDetected: true,
    });

    await expect(new PostgresTopologyWatcher(ds as any).check()).resolves.toBe(
      false,
    );
    expect(ds.destroy).not.toHaveBeenCalled();
  });

  it('ignores the fallback result when no primary was detected', async () => {
    const ds = makeDataSource();
    resolve.mockResolvedValue({
      masterUrl: 'postgresql://c@localhost:5434/db',
      slaveUrls: [],
      primaryDetected: false,
    });

    await expect(new PostgresTopologyWatcher(ds as any).check()).resolves.toBe(
      false,
    );
    expect(ds.destroy).not.toHaveBeenCalled();
  });
});
