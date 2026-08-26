import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'apps/auth-service/src/user/entities/user.entity';
import { Auth } from 'apps/auth-service/src/auth/entities/auth.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Auth])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
