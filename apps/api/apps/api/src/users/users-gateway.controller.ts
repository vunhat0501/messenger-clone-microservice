import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UpdateUserDto } from 'apps/auth-service/src/user/dto/update-user.dto';

@Controller('users')
export class GatewayUsersController {
  constructor(@Inject('AUTH_SERVICE') private authClient: ClientProxy) {}

  @Get()
  findAll() {
    return this.authClient.send('user.find_all', {});
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authClient.send('user.find_one', { id: +id });
  }

  @Get('profile/:userName')
  getProfile(@Param('userName') userName: string) {
    return this.authClient.send('user.get_profile', { userName });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.authClient.send('user.update', { id: +id, updateUserDto });
  }

  @Delete(':id')
  softDeleteUser(@Param('id') id: number) {
    return this.authClient.send('user.soft_delete', { id: +id });
  }
}
