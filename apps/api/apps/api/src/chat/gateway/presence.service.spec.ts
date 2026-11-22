import { PRESENCE_STALE_MS, PresenceService } from './presence.service';

function createFakeRedis() {
  const sets = new Map<string, Set<string>>();
  const zsets = new Map<string, Map<string, number>>();
  const set = (key: string) =>
    sets.get(key) ?? sets.set(key, new Set()).get(key)!;
  const zset = (key: string) =>
    zsets.get(key) ?? zsets.set(key, new Map()).get(key)!;

  return {
    isOpen: true,
    quit: jest.fn(),
    sAdd: jest.fn(async (key: string, member: string) => {
      const s = set(key);
      if (s.has(member)) return 0;
      s.add(member);
      return 1;
    }),
    sRem: jest.fn(async (key: string, member: string) =>
      set(key).delete(member) ? 1 : 0,
    ),
    sMembers: jest.fn(async (key: string) => [...set(key)]),
    sIsMember: jest.fn(async (key: string, member: string) =>
      set(key).has(member) ? 1 : 0,
    ),
    zAdd: jest.fn(
      async (
        key: string,
        { score, value }: { score: number; value: string },
      ) => {
        zset(key).set(value, score);
        return 1;
      },
    ),
    zRem: jest.fn(async (key: string, member: string) =>
      zset(key).delete(member) ? 1 : 0,
    ),
    zCard: jest.fn(async (key: string) => zset(key).size),
    zRemRangeByScore: jest.fn(
      async (key: string, _min: string, max: number) => {
        let removed = 0;
        for (const [member, score] of zset(key)) {
          if (score <= max) {
            zset(key).delete(member);
            removed++;
          }
        }
        return removed;
      },
    ),
  };
}

describe('PresenceService', () => {
  let service: PresenceService;
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    service = new PresenceService();
    (service as any).client = createFakeRedis();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('addConnection', () => {
    it('returns true for the first connection of a user (offline -> online)', async () => {
      await expect(service.addConnection('user-1', 'socket-1')).resolves.toBe(
        true,
      );
      await expect(service.getOnlineUsers()).resolves.toEqual(['user-1']);
    });

    it('returns false when the user already has another connection (e.g. 2nd tab)', async () => {
      await service.addConnection('user-1', 'socket-1');
      await expect(service.addConnection('user-1', 'socket-2')).resolves.toBe(
        false,
      );
    });
  });

  describe('removeConnection', () => {
    it('returns true when removing the last connection (online -> offline)', async () => {
      await service.addConnection('user-1', 'socket-1');
      await expect(
        service.removeConnection('user-1', 'socket-1'),
      ).resolves.toBe(true);
      await expect(service.isUserOnline('user-1')).resolves.toBe(false);
    });

    it('returns false while the user still has other connections', async () => {
      await service.addConnection('user-1', 'socket-1');
      await service.addConnection('user-1', 'socket-2');
      await expect(
        service.removeConnection('user-1', 'socket-1'),
      ).resolves.toBe(false);
      await expect(service.isUserOnline('user-1')).resolves.toBe(true);
    });
  });

  describe('sweepStale', () => {
    it('takes offline a user whose gateway stopped sending heartbeats', async () => {
      await service.addConnection('alice', 'socket-on-dead-gateway');
      now += PRESENCE_STALE_MS + 1;

      await expect(service.sweepStale()).resolves.toEqual(['alice']);
      await expect(service.isUserOnline('alice')).resolves.toBe(false);
    });

    it('keeps users whose sockets are still refreshed by a live gateway', async () => {
      await service.addConnection('bob', 'socket-1');
      now += PRESENCE_STALE_MS - 1000;
      await service.heartbeat([{ userId: 'bob', socketId: 'socket-1' }]);
      now += 2000;

      await expect(service.sweepStale()).resolves.toEqual([]);
      await expect(service.isUserOnline('bob')).resolves.toBe(true);
    });

    it('reports each user going offline only once across gateways', async () => {
      await service.addConnection('alice', 'socket-1');
      now += PRESENCE_STALE_MS + 1;

      await expect(service.sweepStale()).resolves.toEqual(['alice']);
      await expect(service.sweepStale()).resolves.toEqual([]);
    });
  });

  describe('heartbeat', () => {
    it('re-registers sockets that connected while Redis was unavailable', async () => {
      await expect(
        service.heartbeat([{ userId: 'alice', socketId: 'socket-1' }]),
      ).resolves.toEqual(['alice']);
      await expect(
        service.heartbeat([{ userId: 'alice', socketId: 'socket-1' }]),
      ).resolves.toEqual([]);
    });
  });
});
