import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Cart } from '../cart/entities/cart.entity.js';
import { CartItem } from '../cart/entities/cart-item.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { User } from '../users/entities/user.entity.js';

export const entities = [
  User,
  Category,
  Product,
  Cart,
  CartItem,
  Order,
  OrderItem,
];

/**
 * SQLite file taken from DATABASE_URL ("file:./dev.db", same format as the
 * Express project). Use ":memory:" for a throwaway database in tests.
 * `synchronize` builds the tables from the entities; real migrations come
 * in Week 2.
 */
export function databaseConfig(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db';

  return {
    type: 'better-sqlite3',
    database: url.replace(/^file:/, ''),
    entities,
    synchronize: true,
  };
}
