import { z } from 'zod';

export const taskIdSchema = z.coerce.number().int().positive();

export const listTasksQuerySchema = z.object({
  completed: z
    .enum(['true', 'false'])
    .optional()
    .catch(undefined)
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
