//? old way to handle token rotation remove later */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { map, Observable } from 'rxjs';
import { env } from '@/config/env.config';

@Injectable()
export class TokenInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const response = context.switchToHttp().getResponse<Response>();

        if (data?.accessToken) {
          response.cookie('access_token', data.accessToken, {
            httpOnly: true,
            secure: env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 15, // 15 mins
            path: '/',
          });
          delete data.accessToken;
        }

        if (data?.refreshToken) {
          response.cookie('refresh_token', data.refreshToken, {
            httpOnly: true,
            secure: env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
            path: '/',
          });
          delete data.refreshToken;
        }

        return data;
      }),
    );
  }
}
