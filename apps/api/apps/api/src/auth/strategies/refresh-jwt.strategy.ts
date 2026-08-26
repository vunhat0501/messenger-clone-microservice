import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import refreshConfig from 'apps/api/src/auth/config/refresh.config';
import { AuthJwtPayload } from 'apps/api/src/auth/types/auth-jwt-payload';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, throwError } from 'rxjs';

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(
  Strategy,
  'refresh-jwt',
) {
  constructor(
    @Inject(refreshConfig.KEY)
    private refreshJwtConfiguration: ConfigType<typeof refreshConfig>,
    @Inject('AUTH_SERVICE') private authClient: ClientProxy,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: refreshJwtConfiguration.secret as string,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: AuthJwtPayload) {
    const authHeader = req.headers.authorization;
    const refreshToken = authHeader?.split(' ')[1];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    try {
      return await firstValueFrom(
        this.authClient
          .send('auth.validate_refresh', {
            userId: payload.sub,
            refreshToken,
          })
          .pipe(
            catchError((err) =>
              throwError(() => new UnauthorizedException(err.message)),
            ),
          ),
      );
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
