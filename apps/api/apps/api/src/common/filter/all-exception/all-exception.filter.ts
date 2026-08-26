import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const isHttpException = exception instanceof HttpException;
    const httpStatus = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    //** log system track trace if get 500 error (database error, etc...) */
    if (httpStatus === HttpStatus.INTERNAL_SERVER_ERROR) {
      const errorMessage =
        exception instanceof Error ? exception.stack : exception;
      this.logger.error(
        `[${httpAdapter.getRequestUrl(ctx.getRequest())}] ${errorMessage}`,
      );
    }

    //* Get the error message/payload of the DTO error
    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : { message: 'Internal Server Error' };

    //* Handle nestjs default error message
    const errorMessage =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? (exceptionResponse as any).messagek
        : exceptionResponse;

    const responseBody = {
      statusCode: httpStatus,
      message: errorMessage,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
