import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ChatGateway } from 'apps/api/src/chat/gateway/chat.gateway';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'CHAT_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'chat_queue',
          queueOptions: { durable: false },
        },
      },
    ]),
  ],
  providers: [ChatGateway],
})
export class GatewayChatModule {}
