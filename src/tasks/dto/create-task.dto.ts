import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;
