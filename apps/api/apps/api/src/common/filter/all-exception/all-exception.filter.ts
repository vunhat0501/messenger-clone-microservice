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

  catch(exception: any, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const isHttpException = exception instanceof HttpException;
    const isRpcException =
      exception && typeof exception === 'object' && 'statusCode' in exception;

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    if (isHttpException) {
      httpStatus = exception.getStatus();
    } else if (isRpcException) {
      httpStatus = exception.statusCode;
    }

    //** log system stack trace if get 500 error (database error, etc...) */
    if (httpStatus === HttpStatus.INTERNAL_SERVER_ERROR) {
      const errorMessage =
        exception instanceof Error
          ? exception.stack
          : JSON.stringify(exception);

      this.logger.error(
        `[${httpAdapter.getRequestUrl(ctx.getRequest())}] ${errorMessage}`,
      );
    }

    //* Get the error message/payload
    let exceptionResponse: any;
    if (isHttpException) {
      exceptionResponse = exception.getResponse();
    } else if (isRpcException) {
      exceptionResponse = { message: exception.message };
    } else {
      exceptionResponse = { message: 'Internal Server Error' };
    }

    //* Handle nestjs default error message (FIXED TYPO: messagek -> message)
    const errorMessage =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? (exceptionResponse as any).message
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
