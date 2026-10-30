import { z } from 'zod';
import { StandardSchemaPipe } from './standard-schema.pipe.js';

const idSchema = z.coerce.number().int().positive();

/** Validates a `:id` route param. A bad value gives 400 "Invalid <resource> ID". */
export const idPipe = (resource: string) =>
  new StandardSchemaPipe(idSchema, `Invalid ${resource} ID`, false);
