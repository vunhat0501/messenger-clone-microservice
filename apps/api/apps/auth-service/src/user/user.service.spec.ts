import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UserService } from './user.service';
import { User } from 'apps/auth-service/src/user/entities/user.entity';
import { Auth } from 'apps/auth-service/src/auth/entities/auth.entity';
import {
  CACHE_KEYS,
  CACHE_TTL,
} from 'apps/api/src/common/cache/cache.constants';

describe('UserService', () => {
  let service: UserService;
  const mockQueryRunner = {
    manager: {
      getRepository: jest.fn(),
    },
    release: jest.fn().mockResolvedValue(undefined),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    softDelete: jest.fn(),
    manager: {
      connection: {
        createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      },
    },
  };

  const mockAuthRepository = {
    update: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Auth), useValue: mockAuthRepository },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns cached users on cache hit without querying slave', async () => {
      const cached = [
        { id: '11111111-1111-1111-1111-111111111111', userName: 'alice' },
      ];
      mockCacheManager.get.mockResolvedValueOnce(cached);

      const result = await service.findAll();

      expect(result).toEqual(cached);
      expect(mockCacheManager.get).toHaveBeenCalledWith(CACHE_KEYS.USERS_ALL);
      expect(
        mockUserRepository.manager.connection.createQueryRunner,
      ).not.toHaveBeenCalled();
    });

    it('queries slave on cache miss and stores in cache', async () => {
      const dbUsers = [
        { id: '22222222-2222-2222-2222-222222222222', userName: 'bob' },
      ];
      mockCacheManager.get.mockResolvedValueOnce(undefined);
      mockQueryRunner.manager.getRepository.mockReturnValueOnce({
        find: jest.fn().mockResolvedValueOnce(dbUsers),
      });

      const result = await service.findAll();

      expect(result).toEqual(dbUsers);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        CACHE_KEYS.USERS_ALL,
        dbUsers,
        CACHE_TTL.USERS_ALL,
      );
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    const userId = '55555555-5555-5555-5555-555555555555';

    it('returns cached user when present', async () => {
      const cachedUser = { id: userId, userName: 'charlie' };
      mockCacheManager.get.mockResolvedValueOnce(cachedUser);

      const result = await service.findOne(userId);

      expect(result).toEqual(cachedUser);
      expect(mockUserRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('queries repository and caches on miss', async () => {
      const dbUser = { id: userId, userName: 'charlie' };
      mockCacheManager.get.mockResolvedValueOnce(undefined);
      mockUserRepository.findOneBy.mockResolvedValueOnce(dbUser);

      const result = await service.findOne(userId);

      expect(result).toEqual(dbUser);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        CACHE_KEYS.userById(userId),
        dbUser,
        CACHE_TTL.USER_DETAIL,
      );
    });
  });

  describe('softDeleteUser', () => {
    it('invalidates user caches after soft deleting', async () => {
      const userId = '77777777-7777-7777-7777-777777777777';
      mockUserRepository.findOneBy.mockResolvedValueOnce({
        id: userId,
        userName: 'Alice',
      });
      mockUserRepository.softDelete.mockResolvedValueOnce({ affected: 1 });
      mockAuthRepository.update.mockResolvedValueOnce({ affected: 1 });

      await service.softDeleteUser(userId);

      expect(mockCacheManager.del).toHaveBeenCalledWith(CACHE_KEYS.USERS_ALL);
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        CACHE_KEYS.userById(userId),
      );
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        CACHE_KEYS.userByProfile('Alice'),
      );
    });
  });
});
