import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'apps/auth-service/src/user/entities/user.entity';
import { Auth } from 'apps/auth-service/src/auth/entities/auth.entity';
import { RpcException } from '@nestjs/microservices';
import {
  CACHE_KEYS,
  CACHE_TTL,
} from 'apps/api/src/common/cache/cache.constants';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Auth)
    private authRepository: Repository<Auth>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { email },
      withDeleted: true,
    });
  }
  /**
   * ? Helper to execute read queries on a slave if replication is enabled
   * ? falling back cleanly to the primary connection if running on a single DB.
   * ? Don't have to implement now
   */

  /**
   * * private async runOnSlave<T>(
   * *  operation: (repo: Repository<User>) => Promise<T>,
   * * ): Promise<T> {
   * *  const isReplicationActive = this.dataSource.hasMetadata(User) &&
   * *   !!this.dataSource.options.replication;
   *
   * *  if (!isReplicationActive) {
   * *    return operation(this.userRepository);
   * *  }
   *
   * *  const runner = this.dataSource.createQueryRunner('slave');
   * *  try {
   * *    return await operation(runner.manager.getRepository(User));
   * *  } finally {
   * *    await runner.release();
   * *  }
   * * }
   */

  async findAll() {
    const cachedUsers = await this.cacheManager.get<Partial<User>[]>(
      CACHE_KEYS.USERS_ALL,
    );
    if (cachedUsers) {
      return cachedUsers;
    }

    const runner =
      this.userRepository.manager.connection.createQueryRunner('slave');
    try {
      const users = await runner.manager.getRepository(User).find({
        select: ['id', 'userName', 'email', 'avatarUrl', 'bio', 'createdAt'],
      });
      await this.cacheManager.set(
        CACHE_KEYS.USERS_ALL,
        users,
        CACHE_TTL.USERS_ALL,
      );
      return users;
    } finally {
      await runner.release();
    }
  }

  async findOne(userId: string) {
    const cacheKey = CACHE_KEYS.userById(userId);
    const cachedUser = await this.cacheManager.get<User>(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }

    const user = await this.userRepository.findOneBy({ id: userId });
    if (user) {
      await this.cacheManager.set(cacheKey, user, CACHE_TTL.USER_DETAIL);
    }
    return user;
  }

  async getProfile(userName: string): Promise<User | null> {
    const cacheKey = CACHE_KEYS.userByProfile(userName);
    const cachedProfile = await this.cacheManager.get<User>(cacheKey);
    if (cachedProfile) {
      return cachedProfile;
    }

    const user = await this.userRepository.findOne({
      where: { userName },
    });

    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: `User with ${userName} not found`,
      });
    }

    await this.cacheManager.set(cacheKey, user, CACHE_TTL.USER_DETAIL);
    return user;
  }

  async invalidateUserCache(userId?: string, userName?: string) {
    const deletions: Promise<unknown>[] = [
      this.cacheManager.del(CACHE_KEYS.USERS_ALL),
    ];
    if (userId != null) {
      deletions.push(this.cacheManager.del(CACHE_KEYS.userById(userId)));
    }
    if (userName) {
      deletions.push(this.cacheManager.del(CACHE_KEYS.userByProfile(userName)));
    }
    await Promise.all(deletions);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const existing = await this.userRepository.findOneBy({ id });
    await this.invalidateUserCache(id, existing?.userName);
    return `This action updates a #${id} user`;
  }

  async softDeleteUser(id: string): Promise<void> {
    const existing = await this.userRepository.findOneBy({ id });
    const result = await this.userRepository.softDelete(id);
    if (result.affected === 0) {
      throw new RpcException({
        statusCode: 404,
        message: `User with ID ${id} not found`,
      });
    }

    await this.authRepository.update({ user: { id } }, { refreshToken: null });
    await this.invalidateUserCache(id, existing?.userName);
  }
}
