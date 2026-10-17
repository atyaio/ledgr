import { ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { statusCode: status, code: 'INTERNAL', message: 'Internal server error' };

    if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      body = { statusCode: status, code: 'VALIDATION', message: 'Validation failed', details: exception.issues };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body =
        typeof r === 'string'
          ? { statusCode: status, code: codeFor(status), message: r }
          : { statusCode: status, code: codeFor(status), ...(r as object) };
    } else if (isPrismaError(exception)) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        body = { statusCode: status, code: 'DUPLICATE', message: 'A record with the same unique value already exists', details: exception.meta };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = { statusCode: status, code: 'NOT_FOUND', message: 'Record not found' };
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        body = { statusCode: status, code: 'FOREIGN_KEY', message: 'Referenced record does not exist', details: exception.meta };
      } else {
        this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    }
    res.status(status).json(body);
  }
}

function codeFor(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHENTICATED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 413: return 'TOO_LARGE';
    default: return 'ERROR';
  }
}

function isPrismaError(e: unknown): e is { code: string; message: string; meta?: unknown } {
  return typeof e === 'object' && e !== null && 'code' in e && typeof (e as any).code === 'string' && /^P\d{4}$/.test((e as any).code);
}
