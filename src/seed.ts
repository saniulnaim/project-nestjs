import bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Category } from './categories/entities/category.entity.js';
import { slugify } from './common/slug.js';
import { entities } from './database/database.config.js';
import { Product } from './products/entities/product.entity.js';
import { Role, User } from './users/entities/user.entity.js';

// Same data as project-express/prisma/seed.ts so both APIs start identical.
const catalog: Record<string, [name: string, priceCents: number, stock: number][]> = {
  Electronics: [
    ['Wireless Mouse', 1999, 50],
    ['Mechanical Keyboard', 8999, 25],
    ['USB-C Hub', 3499, 40],
    ['Noise Cancelling Headphones', 12999, 15],
    ['Webcam 1080p', 5999, 30],
  ],
  Books: [
    ['Clean Code', 3499, 20],
    ['The Pragmatic Programmer', 4299, 18],
    ['Designing Data-Intensive Applications', 5499, 12],
    ['Refactoring', 4799, 10],
    ['Node.js Design Patterns', 3999, 14],
  ],
  Home: [
    ['Desk Lamp', 2499, 35],
    ['Standing Desk Mat', 3999, 22],
    ['Ceramic Mug', 1299, 100],
    ['Water Bottle', 1899, 80],
    ['Cable Organizer', 899, 120],
  ],
  Accessories: [
    ['Laptop Sleeve', 2999, 45],
    ['Backpack', 6499, 28],
    ['Phone Stand', 1599, 60],
    ['Sticker Pack', 599, 200],
    ['Out of Stock Gadget', 4999, 0],
  ],
};

const url = process.env.DATABASE_URL ?? 'file:./dev.db';
const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: url.replace(/^file:/, ''),
  entities,
  synchronize: true,
});

async function main() {
  const users = dataSource.getRepository(User);
  const categories = dataSource.getRepository(Category);
  const products = dataSource.getRepository(Product);

  if (!(await users.existsBy({ email: 'admin@example.com' }))) {
    await users.save(
      users.create({
        email: 'admin@example.com',
        name: 'Admin',
        role: Role.ADMIN,
        passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'admin12345', 10),
      }),
    );
  }

  for (const [categoryName, items] of Object.entries(catalog)) {
    const slug = slugify(categoryName);
    const category =
      (await categories.findOneBy({ slug })) ??
      (await categories.save(categories.create({ name: categoryName, slug })));

    for (const [name, priceCents, stock] of items) {
      const productSlug = slugify(name);
      if (await products.existsBy({ slug: productSlug })) continue;

      await products.save(
        products.create({
          name,
          slug: productSlug,
          description: `${name} from the ${categoryName} collection.`,
          priceCents,
          stock,
          categoryId: category.id,
        }),
      );
    }
  }
}

try {
  await dataSource.initialize();
  await main();
  console.log('Seed complete');
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
