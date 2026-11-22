import { createMongoHostLookup, parseMongoHostMap } from './mongo-host-map';

const resolve = (
  lookup: ReturnType<typeof createMongoHostLookup>,
  hostname: string,
  options: Record<string, unknown> = {},
) =>
  new Promise<{ address: unknown; family?: number }>((done, fail) =>
    lookup(hostname, options, (err, address, family) =>
      err ? fail(err) : done({ address, family }),
    ),
  );

describe('MongoDB host map', () => {
  const lookup = createMongoHostLookup(
    parseMongoHostMap(
      'mongo_primary=127.0.0.1, mongo_replica=127.0.0.1,mongo_replica_2=127.0.0.1',
    ),
  );

  it('parses name=address pairs', () => {
    expect([...parseMongoHostMap('a=127.0.0.1, b=::1')]).toEqual([
      ['a', '127.0.0.1'],
      ['b', '::1'],
    ]);
  });

  it('resolves an advertised replica set member to the mapped address', async () => {
    await expect(resolve(lookup, 'mongo_replica')).resolves.toEqual({
      address: '127.0.0.1',
      family: 4,
    });
  });

  it('answers the all-addresses form Node uses for dual-stack connects', async () => {
    await expect(
      resolve(lookup, 'mongo_replica_2', { all: true }),
    ).resolves.toEqual({
      address: [{ address: '127.0.0.1', family: 4 }],
      family: undefined,
    });
  });

  it('leaves other names to normal DNS', async () => {
    const { address } = await resolve(lookup, 'localhost');
    expect(typeof address).toBe('string');
  });
});
