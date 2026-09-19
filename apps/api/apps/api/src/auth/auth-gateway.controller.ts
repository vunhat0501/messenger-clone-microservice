import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Inject,
  Req,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthenticatedUser } from '@workspace/types';
import { GetUser } from './decorators/get-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';
import { CreateAuthDto } from 'apps/auth-service/src/auth/dto/create-auth.dto';
import { Public } from 'apps/api/src/auth/decorators/public.decorator';
import { LocalAuthGuard } from 'apps/api/src/auth/guards/local-auth/local-auth.guard';
import { RefreshAuthGuard } from 'apps/api/src/auth/guards/refresh-auth/refresh-auth.guard';
import { Request } from 'express';

@Controller('auth')
export class GatewayAuthController {
  constructor(@Inject('AUTH_SERVICE') private authClient: ClientProxy) {}

  @Public()
  @Post('signup')
  signUp(@Body() createAuthDto: CreateAuthDto) {
    return this.authClient.send('auth.signup', createAuthDto);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('signin')
  signIn(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.authClient.send('auth.signin', user);
  }

  @Public()
  @UseGuards(RefreshAuthGuard)
  @Post('refresh')
  refreshToken(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.authClient.send('auth.refresh', user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@GetUser() user: AuthenticatedUser) {
    return { data: user };
  }

  @Post('signout')
  @UseGuards(JwtAuthGuard)
  signOut(@GetUser('id') userId: number) {
    return this.authClient.send('auth.signout', userId);
  }
}
