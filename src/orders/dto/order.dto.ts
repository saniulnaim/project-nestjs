import { z } from 'zod';
import { paginationShape } from '../../common/pagination.js';
import { OrderStatus } from '../entities/order.entity.js';

export const listOrdersQuerySchema = z.object({
  ...paginationShape,
  status: z.enum(OrderStatus).optional(),
});

export const updateOrderStatusSchema = z.strictObject({
  status: z.enum(OrderStatus),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;
