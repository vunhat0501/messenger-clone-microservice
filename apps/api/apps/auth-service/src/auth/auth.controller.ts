import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { AuthenticatedUser } from '@workspace/types';
import { MessagePattern, Payload } from '@nestjs/microservices';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern('auth.signup')
  signUp(@Payload() createAuthDto: CreateAuthDto) {
    return this.authService.createUser(createAuthDto);
  }

  @MessagePattern('auth.validate_local')
  validateLocalUser(@Payload() data: { email: string; password: string }) {
    return this.authService.validateLocalUser(data.email, data.password);
  }

  @MessagePattern('auth.signin')
  async signIn(@Payload() user: AuthenticatedUser) {
    return this.authService.signIn(user.id, user.name, user.email, user.role);
  }

  @MessagePattern('auth.validate_refresh')
  validateRefreshToken(
    @Payload() data: { userId: number; refreshToken: string },
  ) {
    return this.authService.validateRefreshToken(
      data.userId,
      data.refreshToken,
    );
  }

  @MessagePattern('auth.refresh')
  async refreshToken(@Payload() user: AuthenticatedUser) {
    return this.authService.refreshToken(
      user.id,
      user.name,
      user.email,
      user.role,
    );
  }

  @MessagePattern('auth.signout')
  async signOut(@Payload() userId: number) {
    await this.authService.signOut(userId);
    return { success: true };
  }

  @MessagePattern('auth.update')
  update(@Payload() payload: { id: string; updateAuthDto: UpdateAuthDto }) {
    return this.authService.update(+payload.id, payload.updateAuthDto);
  }

  @MessagePattern('auth.remove')
  remove(@Payload() id: string) {
    return this.authService.remove(+id);
  }
}
