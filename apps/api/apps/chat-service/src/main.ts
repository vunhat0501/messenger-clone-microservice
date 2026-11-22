/* eslint-disable @typescript-eslint/no-floating-promises */
import { NestFactory } from '@nestjs/core';
import { ChatServiceModule } from './chat-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { env } from 'apps/api/src/config/env.config';
import { ValidationPipe } from '@nestjs/common';
import { installRmqRejectionGuard } from 'apps/api/src/common/rmq-rejection-guard';

async function bootstrap() {
  installRmqRejectionGuard();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ChatServiceModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [env.RABBITMQ_URL],
        queue: 'chat_queue',
        queueOptions: { durable: true },
      },
    },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidNonWhitelisted: true,
      whitelist: true,
    }),
  );
  await app.listen();
}
bootstrap();
