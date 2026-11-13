import { Controller, Get, Body, Patch, Param, Delete } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @MessagePattern('user.find_all')
  findAll() {
    return this.userService.findAll();
  }

  @MessagePattern('user.find_one')
  findOne(@Payload() data: { id: string }) {
    return this.userService.findOne(data.id);
  }

  @MessagePattern('user.get_profile')
  async getProfile(@Payload() data: { userName: string }) {
    const user = await this.userService.getProfile(data.userName);

    return {
      id: user.id,
      userName: user.userName,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      createdAt: user.createdAt,
    };
  }

  @MessagePattern('user.update')
  update(@Payload() data: { id: string; updateUserDto: UpdateUserDto }) {
    return this.userService.update(data.id, data.updateUserDto);
  }

  @MessagePattern('user.soft_delete')
  softDeleteUser(@Payload() data: { id: string }) {
    return this.userService.softDeleteUser(data.id);
  }
}
