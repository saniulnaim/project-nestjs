import { z } from 'zod';

export const categorySchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
});

export type CategoryDto = z.infer<typeof categorySchema>;
