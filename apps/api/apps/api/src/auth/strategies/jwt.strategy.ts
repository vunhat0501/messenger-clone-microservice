import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import jwtConfig from 'apps/api/src/auth/config/jwt.config';
import { AuthJwtPayload } from 'apps/api/src/auth/types/auth-jwt-payload';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, Role } from '@workspace/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(jwtConfig.KEY)
    private jwtConfiguration: ConfigType<typeof jwtConfig>,
    // private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtConfiguration.secret as string,
      ignoreExpiration: false,
    });
  }

  async validate(payload: AuthJwtPayload): Promise<AuthenticatedUser> {
    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role as Role,
    };
  }
}
