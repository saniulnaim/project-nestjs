import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity.js';
import { Order } from './order.entity.js';

/** One line of an order. Name and price are a snapshot taken at checkout. */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  orderId!: number;

  @Column({ type: 'integer' })
  productId!: number;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'integer' })
  unitPriceCents!: number;

  @Column({ type: 'integer' })
  quantity!: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order?: Relation<Order>;

  @ManyToOne(() => Product, (product) => product.orderItems)
  @JoinColumn({ name: 'productId' })
  product?: Relation<Product>;
}
