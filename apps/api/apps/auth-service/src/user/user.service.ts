import { Injectable } from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'apps/auth-service/src/user/entities/user.entity';
import { Auth } from 'apps/auth-service/src/auth/entities/auth.entity';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Auth)
    private authRepository: Repository<Auth>,
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
    const runner =
      this.userRepository.manager.connection.createQueryRunner('slave');
    try {
      return await runner.manager.getRepository(User).find({
        select: ['id', 'userName', 'email', 'avatarUrl', 'bio', 'createdAt'],
      });
    } finally {
      await runner.release();
    }
  }

  async findOne(userId: number) {
    return await this.userRepository.findOneBy({ id: userId });
  }

  async getProfile(userName: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { userName },
    });

    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: `User with ${userName} not found`,
      });
    }

    return user;
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  async softDeleteUser(id: number): Promise<void> {
    const result = await this.userRepository.softDelete(id);
    if (result.affected === 0) {
      throw new RpcException({
        statusCode: 404,
        message: `User with ID ${id} not found`,
      });
    }

    await this.authRepository.update({ user: { id } }, { refreshToken: null });
  }
}
