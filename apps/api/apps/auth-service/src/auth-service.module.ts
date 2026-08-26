import { Module } from '@nestjs/common';
import { AuthServiceController } from './auth-service.controller';
import { AuthServiceService } from './auth-service.service';
import { DatabaseModule } from 'apps/auth-service/src/database/postgres-database.module';
import { AuthModule } from 'apps/auth-service/src/auth/auth.module';
import { UserModule } from 'apps/auth-service/src/user/user.module';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ExceptionFilter } from 'apps/auth-service/src/common/filter/rpc-exception/rpc-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UserModule,
  ],
  controllers: [AuthServiceController],
  providers: [
    AuthServiceService,
    { provide: APP_FILTER, useClass: ExceptionFilter },
  ],
})
export class AuthServiceModule {}
