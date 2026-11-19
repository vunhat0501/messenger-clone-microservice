import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ChatGateway } from 'apps/api/src/chat/gateway/chat.gateway';
import { PresenceService } from 'apps/api/src/chat/gateway/presence.service';
import { ChatGatewayController } from './chat-gateway.controller';
import { env } from 'apps/api/src/config/env.config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from 'apps/api/src/auth/config/jwt.config';

@Module({
  imports: [
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
    ClientsModule.register([
      {
        name: 'CHAT_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [env.RABBITMQ_URL],
          queue: 'chat_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'AUTH_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [env.RABBITMQ_URL],
          queue: 'auth_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [ChatGatewayController],
  providers: [ChatGateway, PresenceService],
  exports: [ChatGateway, PresenceService],
})
export class GatewayChatModule {}
