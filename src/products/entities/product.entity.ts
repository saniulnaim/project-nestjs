import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { CartItem } from '../../cart/entities/cart-item.entity.js';
import { Category } from '../../categories/entities/category.entity.js';
import { OrderItem } from '../../orders/entities/order-item.entity.js';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', unique: true })
  slug!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  /** Money is always integer cents. */
  @Column({ type: 'integer' })
  priceCents!: number;

  @Column({ type: 'integer' })
  stock!: number;

  @Index()
  @Column({ type: 'integer' })
  categoryId!: number;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: 'categoryId' })
  category?: Relation<Category>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => CartItem, (item) => item.product)
  cartItems?: Relation<CartItem[]>;

  @OneToMany(() => OrderItem, (item) => item.product)
  orderItems?: Relation<OrderItem[]>;
}
