import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GatewayAuthController } from 'apps/api/src/auth/auth-gateway.controller';
import { env } from 'apps/api/src/config/env.config';
import jwtConfig from 'apps/api/src/auth/config/jwt.config';
import refreshConfig from 'apps/api/src/auth/config/refresh.config';
import { JwtStrategy } from 'apps/api/src/auth/strategies/jwt.strategy';
import { LocalStrategy } from 'apps/api/src/auth/strategies/local.strategy';
import { RefreshJwtStrategy } from 'apps/api/src/auth/strategies/refresh-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(refreshConfig),
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [env.RABBITMQ_URL],
          queue: 'auth_queue',
          queueOptions: { durable: false },
        },
      },
    ]),
  ],
  controllers: [GatewayAuthController],
  providers: [JwtStrategy, LocalStrategy, RefreshJwtStrategy],
})
export class GatewayAuthModule {}
