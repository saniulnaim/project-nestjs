import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { slugify } from '../common/slug.js';
import { Product } from '../products/entities/product.entity.js';
import type { CategoryDto } from './dto/category.dto.js';
import { Category } from './entities/category.entity.js';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categories.find({ order: { name: 'ASC' } });
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categories.findOneBy({ id });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async create(dto: CategoryDto): Promise<Category> {
    await this.assertNameFree(dto.name);

    return this.categories.save(
      this.categories.create({ name: dto.name, slug: slugify(dto.name) }),
    );
  }

  async update(id: number, dto: CategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    await this.assertNameFree(dto.name, id);

    category.name = dto.name;
    category.slug = slugify(dto.name);

    return this.categories.save(category);
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);

    if (await this.products.existsBy({ categoryId: id })) {
      throw new ConflictException('Category has products');
    }

    await this.categories.remove(category);
  }

  // Both name and slug are unique, and "Home Office" / "home office" share a slug.
  private async assertNameFree(name: string, exceptId?: number): Promise<void> {
    const clashes = await this.categories.find({
      where: [{ name }, { slug: slugify(name) }],
    });

    if (clashes.some((category) => category.id !== exceptId)) {
      throw new ConflictException('Category already exists');
    }
  }
}
