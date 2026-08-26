import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AllExceptionFilter } from 'apps/api/src/common/filter/all-exception/all-exception.filter';
import { TransformInterceptor } from 'apps/api/src/common/interceptor/transform/transform.interceptor';
import { TimeoutInterceptor } from 'apps/api/src/common/interceptor/timeout/timeout.interceptor';
import { LoggerMiddleware } from 'apps/api/src/common/middleware/logger/logger.middleware';
import { ChatGateway } from 'apps/api/src/chat/gateway/chat.gateway';
import { GatewayAuthModule } from 'apps/api/src/auth/auth-gateway.module';
import { GatewayChatModule } from 'apps/api/src/chat/chat-gateway.module';
import { GatewayUserModule } from 'apps/api/src/users/users-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GatewayAuthModule,
    GatewayUserModule,
    GatewayChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    ChatGateway,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
