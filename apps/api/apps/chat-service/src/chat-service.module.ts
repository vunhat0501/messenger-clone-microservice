import { Module } from '@nestjs/common';
import { ChatServiceController } from './chat-service.controller';
import { ChatServiceService } from './chat-service.service';
import { APP_FILTER } from '@nestjs/core';
import { ExceptionFilter } from 'apps/chat-service/src/common/filter/rpc-exception/rpc-exception.filter';
import { ConfigModule } from '@nestjs/config';
import { MongoDatabaseModule } from 'apps/chat-service/src/database/mongo-database.module';

import { MongooseModule } from '@nestjs/mongoose';
import {
  Conversation,
  ConversationSchema,
} from './database/schemas/conversation.schema';
import { Message, messageSchema } from './database/schemas/message.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongoDatabaseModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: messageSchema },
    ]),
  ],
  controllers: [ChatServiceController],
  providers: [
    ChatServiceService,
    { provide: APP_FILTER, useClass: ExceptionFilter },
  ],
})
export class ChatServiceModule {}
