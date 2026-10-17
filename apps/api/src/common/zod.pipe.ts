import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Validate + transform a request part with a zod schema. Throws ZodError (→ 400 via filter). */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}

export const zod = <T>(schema: ZodType<T>) => new ZodPipe<T>(schema);
