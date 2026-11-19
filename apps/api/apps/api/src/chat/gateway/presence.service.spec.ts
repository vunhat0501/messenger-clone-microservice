import { PresenceService } from './presence.service';

describe('PresenceService', () => {
  let service: PresenceService;
  let mockRedisClient: any;

  beforeEach(() => {
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      sAdd: jest.fn(),
      sRem: jest.fn(),
      sCard: jest.fn(),
      sMembers: jest.fn(),
      sIsMember: jest.fn(),
      isOpen: true,
    };

    service = new PresenceService();
    (service as any).client = mockRedisClient;
  });

  describe('addConnection', () => {
    it('returns true when adding the first connection for a user (offline -> online)', async () => {
      mockRedisClient.sAdd.mockResolvedValue(1);
      mockRedisClient.sCard.mockResolvedValue(1);

      const isFirst = await service.addConnection('user-1', 'socket-1');

      expect(isFirst).toBe(true);
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('presence:user_sockets:user-1', 'socket-1');
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('presence:online_users', 'user-1');
    });

    it('returns false when user already has another active connection (e.g. 2nd tab)', async () => {
      mockRedisClient.sAdd.mockResolvedValue(1);
      mockRedisClient.sCard.mockResolvedValue(2);

      const isFirst = await service.addConnection('user-1', 'socket-2');

      expect(isFirst).toBe(false);
    });
  });

  describe('removeConnection', () => {
    it('returns true when removing the last connection for a user (online -> offline)', async () => {
      mockRedisClient.sRem.mockResolvedValue(1);
      mockRedisClient.sCard.mockResolvedValue(0);

      const isLast = await service.removeConnection('user-1', 'socket-1');

      expect(isLast).toBe(true);
      expect(mockRedisClient.sRem).toHaveBeenCalledWith('presence:user_sockets:user-1', 'socket-1');
      expect(mockRedisClient.sRem).toHaveBeenCalledWith('presence:online_users', 'user-1');
    });

    it('returns false when user still has other active connections remaining', async () => {
      mockRedisClient.sRem.mockResolvedValue(1);
      mockRedisClient.sCard.mockResolvedValue(1);

      const isLast = await service.removeConnection('user-1', 'socket-1');

      expect(isLast).toBe(false);
      expect(mockRedisClient.sRem).not.toHaveBeenCalledWith('presence:online_users', 'user-1');
    });
  });

  describe('getOnlineUsers', () => {
    it('returns members of online_users set', async () => {
      const users = ['user-1', 'user-2'];
      mockRedisClient.sMembers.mockResolvedValue(users);

      const res = await service.getOnlineUsers();

      expect(res).toEqual(users);
      expect(mockRedisClient.sMembers).toHaveBeenCalledWith('presence:online_users');
    });
  });
});
