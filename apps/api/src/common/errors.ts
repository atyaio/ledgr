import { HttpException, HttpStatus } from '@nestjs/common';

/** HttpException with a machine-readable `code`. */
export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const notFound = (entity: string, id?: string) =>
  new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', id ? `${entity} ${id} not found` : `${entity} not found`);
export const badRequest = (code: string, message: string, details?: unknown) => new ApiException(HttpStatus.BAD_REQUEST, code, message, details);
export const conflict = (code: string, message: string, details?: unknown) => new ApiException(HttpStatus.CONFLICT, code, message, details);
