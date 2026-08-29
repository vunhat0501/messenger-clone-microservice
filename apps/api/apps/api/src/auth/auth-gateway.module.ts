import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GatewayAuthController } from 'apps/api/src/auth/auth-gateway.controller';
import { env } from 'apps/api/src/config/env.config';

@Module({
  imports: [
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
})
export class GatewayAuthModule {}
