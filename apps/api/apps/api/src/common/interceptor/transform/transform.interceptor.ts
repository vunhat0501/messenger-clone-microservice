import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const http = context.switchToHttp();
    const response = http?.getResponse();
    if (response && typeof response.setHeader === 'function') {
      const instanceId =
        process.env.INSTANCE_ID || `gateway-${process.env.PORT || 8008}`;
      response.setHeader('X-Instance-Id', instanceId);
    }

    return next
      .handle()
      .pipe()
      .pipe(map((data) => ({ data })));
  }
}
