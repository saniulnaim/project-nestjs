import { z } from 'zod';

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    completed: z.boolean().optional(),
  })
  .refine((data) => data.title !== undefined || data.completed !== undefined, {
    message: 'At least one field is required',
  });

export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;
