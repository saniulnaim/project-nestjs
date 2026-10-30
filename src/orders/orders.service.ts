import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.js';
import { CartItem } from '../cart/entities/cart-item.entity.js';
import { pageMeta, paginate } from '../common/pagination.js';
import { runInTransaction } from '../common/transaction.js';
import { Product } from '../products/entities/product.entity.js';
import { Role } from '../users/entities/user.entity.js';
import type { ListOrdersQuery } from './dto/order.dto.js';
import { Order, OrderStatus } from './entities/order.entity.js';

const transitions: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

const withItems = {
  relations: { items: true },
  order: { items: { id: 'ASC' } },
} as const;

const present = (order: Order) => ({
  id: order.id,
  userId: order.userId,
  status: order.status,
  totalCents: order.totalCents,
  items: (order.items ?? []).map((item) => ({
    productId: item.productId,
    name: item.name,
    unitPriceCents: item.unitPriceCents,
    quantity: item.quantity,
  })),
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {}

  /** Turns the caller's cart into an order. All or nothing. */
  async checkout(userId: number) {
    const order = await runInTransaction(this.dataSource, async (tx) => {
      const lines = await tx.find(CartItem, {
        where: { cart: { userId } },
        relations: { product: true },
        order: { id: 'ASC' },
      });

      if (lines.length === 0) {
        throw new ConflictException('Cart is empty');
      }

      for (const line of lines) {
        const product = line.product as Product;

        // the stock condition keeps the decrement safe even if stock changed meanwhile
        const result = await tx
          .createQueryBuilder()
          .update(Product)
          .set({ stock: () => `stock - ${Number(line.quantity)}` })
          .where('id = :id AND stock >= :quantity', {
            id: line.productId,
            quantity: line.quantity,
          })
          .execute();

        if (!result.affected) {
          throw new ConflictException(`Insufficient stock for ${product.name}`);
        }
      }

      const created = await tx.save(
        tx.create(Order, {
          userId,
          totalCents: lines.reduce(
            (sum, line) =>
              sum + (line.product as Product).priceCents * line.quantity,
            0,
          ),
          // name and price are copied, so later product edits never change the order
          items: lines.map((line) => ({
            productId: line.productId,
            name: (line.product as Product).name,
            unitPriceCents: (line.product as Product).priceCents,
            quantity: line.quantity,
          })),
        }),
      );

      await tx.delete(
        CartItem,
        lines.map((line) => line.id),
      );

      return tx.findOneOrFail(Order, { where: { id: created.id }, ...withItems });
    });

    return present(order);
  }

  async findAll(auth: AuthUser, query: ListOrdersQuery) {
    const { skip, take } = paginate(query.page, query.limit);

    const [orders, total] = await this.orders.findAndCount({
      where: {
        ...(auth.role === Role.ADMIN ? {} : { userId: auth.id }),
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      ...withItems,
      order: { createdAt: 'DESC', id: 'DESC', items: { id: 'ASC' } },
      skip,
      take,
    });

    return {
      data: orders.map(present),
      meta: pageMeta(query.page, query.limit, total),
    };
  }

  async findOne(auth: AuthUser, id: number) {
    const order = await this.orders.findOne({ where: { id }, ...withItems });

    // other people's orders look like missing ones
    if (!order || (auth.role !== Role.ADMIN && order.userId !== auth.id)) {
      throw new NotFoundException('Order not found');
    }

    return present(order);
  }

  updateStatus(id: number, next: OrderStatus) {
    return this.changeStatus(id, next);
  }

  /** The owner may cancel, but only while the order is still pending. */
  async cancelOwn(userId: number, id: number) {
    const order = await this.orders.findOneBy({ id });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException('Invalid status transition');
    }

    return this.changeStatus(id, OrderStatus.CANCELLED);
  }

  private async changeStatus(id: number, next: OrderStatus) {
    const order = await runInTransaction(this.dataSource, async (tx) => {
      const current = await tx.findOne(Order, { where: { id }, ...withItems });

      if (!current) {
        throw new NotFoundException('Order not found');
      }

      if (!transitions[current.status].includes(next)) {
        throw new ConflictException('Invalid status transition');
      }

      if (next === OrderStatus.CANCELLED) {
        await this.restoreStock(tx, current);
      }

      await tx.update(Order, id, { status: next });

      return tx.findOneOrFail(Order, { where: { id }, ...withItems });
    });

    return present(order);
  }

  private async restoreStock(tx: EntityManager, order: Order): Promise<void> {
    for (const item of order.items ?? []) {
      await tx.increment(Product, { id: item.productId }, 'stock', item.quantity);
    }
  }
}
