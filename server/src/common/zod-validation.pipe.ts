import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/** Validate a payload at the boundary against a shared-contracts zod schema (doc 10 Phase 1). */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) throw new BadRequestException({ message: 'validation failed', issues: r.error.issues });
    return r.data;
  }
}
