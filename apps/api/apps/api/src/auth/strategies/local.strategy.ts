import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { catchError, firstValueFrom, throwError } from 'rxjs';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject('AUTH_SERVICE') private authClient: ClientProxy) {
    super({
      usernameField: 'email',
    });
  }

  async validate(email: string, password: string) {
    try {
      const user = await firstValueFrom(
        this.authClient
          .send('auth.validate_local', { email, password })
          .pipe(
            catchError((err) =>
              throwError(() => new UnauthorizedException(err.message)),
            ),
          ),
      );

      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid credentials');
    }
  }
}
