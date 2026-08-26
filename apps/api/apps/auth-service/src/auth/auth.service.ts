import { Inject, Injectable } from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { hash, verify } from 'argon2';
import { AuthenticatedUser, Role } from '@workspace/types';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import { Auth } from 'apps/auth-service/src/auth/entities/auth.entity';
import { UserService } from 'apps/auth-service/src/user/user.service';
import refreshConfig from 'apps/api/src/auth/config/refresh.config';
import { User } from 'apps/auth-service/src/user/entities/user.entity';
import { AuthJwtPayload } from 'apps/api/src/auth/types/auth-jwt-payload';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Auth)
    private authRepository: Repository<Auth>,
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    @Inject(refreshConfig.KEY)
    private readonly refreshTokenConfig: ConfigType<typeof refreshConfig>,
  ) {}

  async createUser(createAuthDto: CreateAuthDto) {
    const user = await this.userService.findByEmail(createAuthDto.email);
    if (user) {
      throw new RpcException({
        statusCode: 409,
        message: 'User already exists',
      });
    }

    const hashedPassword = await hash(createAuthDto.password);

    return this.dataSource.transaction(async (transactionalEntityManager) => {
      const newUser = transactionalEntityManager.create(User, {
        userName: createAuthDto.userName,
        email: createAuthDto.email,
      });
      const savedUser = await transactionalEntityManager.save(User, newUser);
      const newAuth = transactionalEntityManager.create(Auth, {
        hashedPassword,
        authProvider: 'local',
        user: savedUser,
      });

      return transactionalEntityManager.save(Auth, newAuth);
    });
  }

  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const authRecord = await this.authRepository.findOne({
      where: {
        authProvider: 'local',
        user: {
          email,
        },
      },
      relations: ['user'],
    });

    if (!authRecord || !authRecord.hashedPassword) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid email or password',
      });
    }
    const isPasswordMatched = await verify(authRecord.hashedPassword, password);
    if (!isPasswordMatched) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid credentials',
      });
    }
    const { user } = authRecord;
    return {
      id: user.id,
      name: user.userName,
      email: user.email,
      role: user.role,
    };
  }

  async signIn(userId: number, name: string, email: string, role: Role) {
    const { accessToken, refreshToken } = await this.generateTokens(
      userId,
      name,
      email,
      role,
    );
    const hashedRefreshToken = await hash(refreshToken);
    const result = await this.authRepository.update(
      {
        authProvider: 'local',
        user: userId as any,
      },
      {
        refreshToken: hashedRefreshToken,
      },
    );

    if (result.affected === 0) {
      throw new RpcException({ statusCode: 404, message: 'User not found' });
    }

    return {
      id: userId,
      name,
      email,
      role,
      accessToken,
      refreshToken,
    };
  }

  async signOut(userId: number) {
    return this.authRepository.update(
      { user: userId as any, authProvider: 'local' },
      { refreshToken: null },
    );
  }

  async generateTokens(
    userId: number,
    name: string,
    email: string,
    role: Role,
  ) {
    const payload: AuthJwtPayload = { sub: userId, name, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, this.refreshTokenConfig),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(userId: number, name: string, email: string, role: Role) {
    const { accessToken, refreshToken } = await this.generateTokens(
      userId,
      name,
      email,
      role,
    );
    const hashedRefreshToken = await hash(refreshToken);
    const result = await this.authRepository.update(
      {
        authProvider: 'local',
        user: userId as any,
      },
      {
        refreshToken: hashedRefreshToken,
      },
    );

    if (result.affected === 0) {
      throw new RpcException({ statusCode: 404, message: 'User not found' });
    }
    return {
      id: userId,
      name,
      email,
      role,
      accessToken,
      refreshToken,
    };
  }

  // async validateJwtUser(payload: AuthJwtPayload): Promise<AuthenticatedUser> {
  //   const currentUser: AuthenticatedUser = {
  //     id: payload.sub,
  //     name: payload.name,
  //     email: payload.email,
  //     role: payload.role as Role,
  //   };

  //   return currentUser;
  // }

  async validateRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<AuthenticatedUser> {
    const authRecord = await this.authRepository.findOne({
      where: {
        authProvider: 'local',
        user: {
          id: userId,
        },
      },
      relations: ['user'],
    });
    if (!authRecord || !authRecord.refreshToken) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid refresh token',
      });
    }

    const isRefreshTokenMatched = await verify(
      authRecord.refreshToken,
      refreshToken,
    );

    if (!isRefreshTokenMatched) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid refresh token',
      });
    }
    const { user } = authRecord;
    return {
      id: user.id,
      name: user.userName,
      email: user.email,
      role: user.role,
    };
  }

  update(id: number, updateAuthDto: UpdateAuthDto) {
    return `This action updates a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }
}
