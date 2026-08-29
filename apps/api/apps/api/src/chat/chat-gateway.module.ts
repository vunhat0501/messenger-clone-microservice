import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ChatGateway } from 'apps/api/src/chat/gateway/chat.gateway';
import { env } from 'apps/api/src/config/env.config';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'CHAT_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [env.RABBITMQ_URL],
          queue: 'chat_queue',
          queueOptions: { durable: false },
        },
      },
    ]),
  ],
  providers: [ChatGateway],
})
export class GatewayChatModule {}
