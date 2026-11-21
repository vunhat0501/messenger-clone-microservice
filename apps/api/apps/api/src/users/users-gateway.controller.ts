import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Inject,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UpdateUserDto } from 'apps/auth-service/src/user/dto/update-user.dto';
import { JwtAuthGuard } from 'apps/api/src/auth/guards/jwt-auth/jwt-auth.guard';
import { GetUser } from 'apps/api/src/auth/decorators/get-user.decorator';
import { AuthenticatedUser, Role } from '@workspace/types';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class GatewayUsersController {
  constructor(@Inject('AUTH_SERVICE') private authClient: ClientProxy) {}

  @Get()
  findAll() {
    return this.authClient.send('user.find_all', {});
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authClient.send('user.find_one', { id });
  }

  @Get('profile/:userName')
  getProfile(@Param('userName') userName: string) {
    return this.authClient.send('user.get_profile', { userName });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    if (user.role !== Role.ADMIN && String(user.id) !== String(id)) {
      throw new ForbiddenException(
        'You are only allowed to modify your own account',
      );
    }
    return this.authClient.send('user.update', { id, updateUserDto });
  }

  @Delete(':id')
  softDeleteUser(
    @Param('id') id: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    if (user.role !== Role.ADMIN && String(user.id) !== String(id)) {
      throw new ForbiddenException(
        'You are only allowed to delete your own account',
      );
    }
    return this.authClient.send('user.soft_delete', { id });
  }
}
