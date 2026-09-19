import { Module } from '@nestjs/common';
import { ChatServiceController } from './chat-service.controller';
import { ChatServiceService } from './chat-service.service';
import { APP_FILTER } from '@nestjs/core';
import { ExceptionFilter } from 'apps/chat-service/src/common/filter/rpc-exception/rpc-exception.filter';
import { ConfigModule } from '@nestjs/config';
import { MongoDatabaseModule } from 'apps/chat-service/src/database/mongo-database.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), MongoDatabaseModule],
  controllers: [ChatServiceController],
  providers: [
    ChatServiceService,
    { provide: APP_FILTER, useClass: ExceptionFilter },
  ],
})
export class ChatServiceModule {}
