import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from 'apps/api/src/auth/config/jwt.config';
import { Auth } from 'apps/auth-service/src/auth/entities/auth.entity';
import refreshConfig from 'apps/api/src/auth/config/refresh.config';
import { UserModule } from 'apps/auth-service/src/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Auth]),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(refreshConfig),
    UserModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
