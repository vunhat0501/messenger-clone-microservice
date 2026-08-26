import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GatewayAuthController } from 'apps/api/src/auth/auth-gateway.controller';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'auth_queue',
          queueOptions: { durable: false },
        },
      },
    ]),
  ],
  controllers: [GatewayAuthController],
})
export class GatewayAuthModule {}
