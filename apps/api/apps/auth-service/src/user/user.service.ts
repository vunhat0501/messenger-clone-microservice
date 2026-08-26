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

  findAll() {
    return `This action returns all users`;
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
