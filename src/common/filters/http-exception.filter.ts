import {
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    // The Express adapter turns the body-parser SyntaxError into
    // new BadRequestException(error.message), which is the only place a 400
    // carries Nest's default `error: 'Bad Request'` field. Our own 400s are
    // built from { message, errors? } objects and never have it.
    if (
      exception instanceof BadRequestException &&
      typeof exception.getResponse() === 'object' &&
      (exception.getResponse() as Record<string, unknown>)['error'] === 'Bad Request'
    ) {
      res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid JSON body' });
      return;
    }

    // Nest's router raises "Cannot GET /x" for paths no controller handles
    if (
      exception instanceof NotFoundException &&
      /^Cannot [A-Z]+ \//.test(exception.message)
    ) {
      res.status(HttpStatus.NOT_FOUND).json({ message: 'Route not found' });
      return;
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { message: body }
          : (({ message, errors }: Record<string, unknown>) => ({
              message,
              ...(errors === undefined ? {} : { errors }),
            }))(body as Record<string, unknown>);

      res.status(exception.getStatus()).json(payload);
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error' });
  }
}
