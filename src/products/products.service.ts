import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Not, Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity.js';
import { pageMeta, paginate } from '../common/pagination.js';
import { slugify } from '../common/slug.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import type {
  CreateProductDto,
  ListProductsQuery,
  UpdateProductDto,
} from './dto/product.dto.js';
import { Product } from './entities/product.entity.js';

// every sort ends on id so pages never overlap
const sorts: Record<ListProductsQuery['sort'], [string, 'ASC' | 'DESC'][]> = {
  price_asc: [['p.priceCents', 'ASC'], ['p.id', 'ASC']],
  price_desc: [['p.priceCents', 'DESC'], ['p.id', 'ASC']],
  newest: [['p.createdAt', 'DESC'], ['p.id', 'DESC']],
  name: [['p.name', 'ASC'], ['p.id', 'ASC']],
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
  ) {}

  async findAll(query: ListProductsQuery) {
    const qb = this.products.createQueryBuilder('p');

    if (query.q !== undefined) {
      // LIKE is case-insensitive in SQLite; escape so "%" and "_" match literally
      const term = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
      qb.andWhere(
        "(p.name LIKE :term ESCAPE '\\' OR p.description LIKE :term ESCAPE '\\')",
        { term },
      );
    }
    if (query.categoryId !== undefined) {
      qb.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.minPrice !== undefined) {
      qb.andWhere('p.priceCents >= :minPrice', { minPrice: query.minPrice });
    }
    if (query.maxPrice !== undefined) {
      qb.andWhere('p.priceCents <= :maxPrice', { maxPrice: query.maxPrice });
    }
    if (query.inStock) {
      qb.andWhere('p.stock > 0');
    }

    sorts[query.sort].forEach(([column, direction], index) =>
      index === 0 ? qb.orderBy(column, direction) : qb.addOrderBy(column, direction),
    );

    const { skip, take } = paginate(query.page, query.limit);
    const [data, total] = await qb.skip(skip).take(take).getManyAndCount();

    return { data, meta: pageMeta(query.page, query.limit, total) };
  }

  async findOne(id: number) {
    const product = await this.products.findOne({
      where: { id },
      relations: { category: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.withCategory(product);
  }

  async create(dto: CreateProductDto) {
    await this.assertCategoryExists(dto.categoryId);

    const product = await this.products.save(
      this.products.create({ ...dto, slug: await this.uniqueSlug(dto.name) }),
    );

    return this.findOne(product.id);
  }

  async update(id: number, dto: UpdateProductDto) {
    const product = await this.products.findOneBy({ id });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(dto.categoryId);
    }

    Object.assign(
      product,
      Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
    );

    if (dto.name !== undefined) {
      product.slug = await this.uniqueSlug(dto.name, id);
    }

    await this.products.save(product);

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const product = await this.products.findOneBy({ id });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (await this.orderItems.existsBy({ productId: id })) {
      throw new ConflictException('Product has been ordered');
    }

    await this.products.remove(product);
  }

  private withCategory(product: Product) {
    const { category, ...rest } = product;

    return {
      ...rest,
      category: category && {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
    };
  }

  private async assertCategoryExists(id: number): Promise<void> {
    if (!(await this.categories.existsBy({ id }))) {
      throw new NotFoundException('Category not found');
    }
  }

  // "Mouse" -> mouse, a second "Mouse" -> mouse-2, and so on
  private async uniqueSlug(name: string, exceptId?: number): Promise<string> {
    const base = slugify(name);
    const taken = new Set(
      (
        await this.products.find({
          select: { slug: true },
          where: {
            slug: Like(`${base}%`),
            ...(exceptId === undefined ? {} : { id: Not(exceptId) }),
          },
        })
      ).map((p) => p.slug),
    );

    let slug = base;

    for (let n = 2; taken.has(slug); n++) {
      slug = `${base}-${n}`;
    }

    return slug;
  }
}
