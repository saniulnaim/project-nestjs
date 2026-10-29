import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';

@Injectable()
export class StandardSchemaPipe<S extends StandardSchemaV1>
  implements PipeTransform<unknown, StandardSchemaV1.InferOutput<S>>
{
  constructor(
    private readonly schema: S,
    private readonly message = 'Validation failed',
    private readonly includeIssues = true,
  ) {}

  async transform(value: unknown): Promise<StandardSchemaV1.InferOutput<S>> {
    const result = await this.schema['~standard'].validate(value);

    if (result.issues) {
      throw new BadRequestException({
        message: this.message,
        ...(this.includeIssues ? { errors: result.issues } : {}),
      });
    }

    return result.value;
  }
}
