import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity.js';
import { Cart } from './entities/cart.entity.js';
import { CartItem } from './entities/cart-item.entity.js';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async getCart(userId: number) {
    const cart = await this.carts.findOne({
      where: { userId },
      relations: { items: { product: true } },
      order: { items: { id: 'ASC' } },
    });

    const items = (cart?.items ?? []).map((item) => {
      const product = item.product as Product;

      return {
        id: item.id,
        productId: item.productId,
        name: product.name,
        unitPriceCents: product.priceCents,
        quantity: item.quantity,
        lineTotalCents: product.priceCents * item.quantity,
      };
    });

    return {
      items,
      totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
    };
  }

  async addItem(userId: number, productId: number, quantity: number) {
    const product = await this.products.findOneBy({ id: productId });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const cart = await this.cartFor(userId);
    const existing = await this.items.findOneBy({ cartId: cart.id, productId });

    if ((existing?.quantity ?? 0) + quantity > product.stock) {
      throw new ConflictException('Insufficient stock');
    }

    if (existing) {
      existing.quantity += quantity;
      await this.items.save(existing);
    } else {
      await this.items.save(
        this.items.create({ cartId: cart.id, productId, quantity }),
      );
    }

    return this.getCart(userId);
  }

  async setQuantity(userId: number, itemId: number, quantity: number) {
    const item = await this.ownedItem(userId, itemId);

    if (quantity > (item.product as Product).stock) {
      throw new ConflictException('Insufficient stock');
    }

    item.quantity = quantity;
    await this.items.save(item);

    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number): Promise<void> {
    await this.items.remove(await this.ownedItem(userId, itemId));
  }

  async clear(userId: number): Promise<void> {
    const cart = await this.carts.findOneBy({ userId });

    if (cart) {
      await this.items.delete({ cartId: cart.id });
    }
  }

  // One cart per user, created on first use. orIgnore covers two simultaneous first requests.
  private async cartFor(userId: number): Promise<Cart> {
    await this.carts
      .createQueryBuilder()
      .insert()
      .values({ userId })
      .orIgnore()
      .execute();

    return this.carts.findOneByOrFail({ userId });
  }

  // Someone else's item looks exactly like a missing one.
  private async ownedItem(userId: number, itemId: number): Promise<CartItem> {
    const item = await this.items.findOne({
      where: { id: itemId, cart: { userId } },
      relations: { product: true },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    return item;
  }
}
