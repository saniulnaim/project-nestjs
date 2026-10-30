import { z } from 'zod';
import { paginationShape } from '../../common/pagination.js';

const productShape = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
  priceCents: z.number().int().min(0),
  stock: z.number().int().min(0),
  categoryId: z.number().int().positive(),
};

export const createProductSchema = z.strictObject({
  ...productShape,
  description: productShape.description.default(''),
});

// no defaults here, so an omitted field is never overwritten
export const updateProductSchema = z
  .strictObject(productShape)
  .partial()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field is required',
  });

export const listProductsQuerySchema = z
  .object({
    ...paginationShape,
    q: z.string().trim().min(1).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    inStock: z.literal('true').optional(),
    sort: z
      .enum(['price_asc', 'price_desc', 'newest', 'name'])
      .default('newest'),
  })
  .refine(
    (q) =>
      q.minPrice === undefined ||
      q.maxPrice === undefined ||
      q.minPrice <= q.maxPrice,
    { message: 'minPrice must be <= maxPrice' },
  );

export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
