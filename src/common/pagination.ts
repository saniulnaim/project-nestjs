import { z } from 'zod';

/** `page` and `limit` query params, shared by every paginated list. */
export const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export function paginate(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}

export function pageMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
