import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, type Repository } from 'typeorm';
import { Cart } from './../src/cart/entities/cart.entity.js';
import { CartItem } from './../src/cart/entities/cart-item.entity.js';
import { OrderItem } from './../src/orders/entities/order-item.entity.js';
import { Order } from './../src/orders/entities/order.entity.js';
import { Role, User } from './../src/users/entities/user.entity.js';
import { bearer, createTestApp, loginAdmin, registerCustomer } from './helpers.js';

describe('Products (e2e)', () => {
  let app: INestApplication;
  let admin: string;
  let categoryId: number;

  beforeEach(async () => {
    app = await createTestApp();
    admin = await loginAdmin(app);
    categoryId = (
      await request(app.getHttpServer())
        .post('/categories')
        .set(bearer(admin))
        .send({ name: 'Gadgets' })
    ).body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  // via DataSource, so it works for entities whose modules don't exist yet
  const repo = <T extends object>(entity: new () => T): Repository<T> =>
    app.get(DataSource).getRepository(entity);

  const create = (overrides: Record<string, unknown> = {}) =>
    http()
      .post('/products')
      .set(bearer(admin))
      .send({
        name: 'Mouse',
        description: 'A wireless mouse',
        priceCents: 1999,
        stock: 10,
        categoryId,
        ...overrides,
      });

  const names = (res: request.Response) =>
    res.body.data.map((p: { name: string }) => p.name);

  it('only lets admins write', async () => {
    const customer = await registerCustomer(app);
    const { body } = await create();

    await http().post('/products').send({}).expect(401);
    await http().patch(`/products/${body.id}`).send({ stock: 1 }).expect(401);
    await http().delete(`/products/${body.id}`).expect(401);

    const forbidden = await http().post('/products').set(bearer(customer)).send({}).expect(403);
    expect(forbidden.body).toEqual({ message: 'Forbidden' });
    await http().patch(`/products/${body.id}`).set(bearer(customer)).send({ stock: 1 }).expect(403);
    await http().delete(`/products/${body.id}`).set(bearer(customer)).expect(403);
  });

  it('creates a product with a slug, category and defaults', async () => {
    const res = await create({ name: '  Wireless Mouse ', description: undefined }).expect(201);

    expect(res.body).toMatchObject({
      name: 'Wireless Mouse',
      slug: 'wireless-mouse',
      description: '',
      priceCents: 1999,
      stock: 10,
      categoryId,
      category: { id: categoryId, name: 'Gadgets', slug: 'gadgets' },
    });
    expect(Object.keys(res.body.category).sort()).toEqual(['id', 'name', 'slug']);
  });

  it('gives products with the same name distinct slugs', async () => {
    const slugs = [];
    for (let i = 0; i < 3; i++) slugs.push((await create()).body.slug);
    expect(slugs).toEqual(['mouse', 'mouse-2', 'mouse-3']);
  });

  it('rejects invalid bodies and unknown categories', async () => {
    const bad: Record<string, unknown>[] = [
      { name: '' },
      { priceCents: -1 },
      { priceCents: 9.99 },
      { stock: -1 },
      { stock: '5' },
      { categoryId: 0 },
      { name: 'x'.repeat(121) },
      { description: 'x'.repeat(2001) },
      { extra: true },
    ];

    for (const overrides of bad) {
      const res = await create(overrides).expect(400);
      expect(res.body.message).toBe('Validation failed');
    }

    await http().post('/products').set(bearer(admin)).send({ name: 'No price' }).expect(400);

    const missing = await create({ categoryId: 999 }).expect(404);
    expect(missing.body).toEqual({ message: 'Category not found' });
  });

  it('reads one product and 404 / 400 for missing / invalid ids', async () => {
    const { body } = await create();

    const res = await http().get(`/products/${body.id}`).expect(200);
    expect(res.body.category.name).toBe('Gadgets');

    expect((await http().get('/products/999').expect(404)).body).toEqual({
      message: 'Product not found',
    });
    expect((await http().get('/products/abc').expect(400)).body).toEqual({
      message: 'Invalid product ID',
    });
  });

  it('updates a subset of fields and leaves the rest alone', async () => {
    const { body } = await create();

    const res = await http()
      .patch(`/products/${body.id}`)
      .set(bearer(admin))
      .send({ priceCents: 1499, stock: 0 })
      .expect(200);

    expect(res.body).toMatchObject({
      name: 'Mouse',
      description: 'A wireless mouse',
      priceCents: 1499,
      stock: 0,
      slug: 'mouse',
    });
  });

  it('refreshes the slug on rename without clashing with itself', async () => {
    const first = (await create()).body;
    const second = (await create({ name: 'Keyboard' })).body;
    const patch = (id: number, body: object) =>
      http().patch(`/products/${id}`).set(bearer(admin)).send(body);

    expect((await patch(first.id, { name: 'Mouse' }).expect(200)).body.slug).toBe('mouse');
    expect((await patch(second.id, { name: 'Mouse' }).expect(200)).body.slug).toBe('mouse-2');
    expect((await patch(first.id, { name: 'Trackball' }).expect(200)).body.slug).toBe('trackball');
  });

  it('rejects empty updates, bad values, missing products and categories', async () => {
    const { body } = await create();
    const patch = (id: number | string, payload: object) =>
      http().patch(`/products/${id}`).set(bearer(admin)).send(payload);

    await patch(body.id, {}).expect(400);
    await patch(body.id, { stock: -5 }).expect(400);
    await patch(body.id, { nope: 1 }).expect(400);
    await patch(body.id, { categoryId: 999 }).expect(404);
    await patch(999, { stock: 1 }).expect(404);
    await patch('abc', { stock: 1 }).expect(400);
  });

  it('deletes a product, and its cart lines go with it', async () => {
    const { body } = await create();

    const user = await repo(User).save(
      repo(User).create({ email: 'c@example.com', name: 'C', passwordHash: 'x', role: Role.CUSTOMER }),
    );
    const cart = await repo(Cart).save(repo(Cart).create({ userId: user.id }));
    await repo(CartItem).save(
      repo(CartItem).create({ cartId: cart.id, productId: body.id, quantity: 1 }),
    );

    await http().delete(`/products/${body.id}`).set(bearer(admin)).expect(204);
    await http().get(`/products/${body.id}`).expect(404);
    expect(await repo(CartItem).count()).toBe(0);
    await http().delete(`/products/${body.id}`).set(bearer(admin)).expect(404);
  });

  it('refuses to delete a product that has been ordered', async () => {
    const { body } = await create();

    const user = await repo(User).save(
      repo(User).create({ email: 'c@example.com', name: 'C', passwordHash: 'x', role: Role.CUSTOMER }),
    );
    const order = await repo(Order).save(repo(Order).create({ userId: user.id, totalCents: 1999 }));
    await repo(OrderItem).save(
      repo(OrderItem).create({
        orderId: order.id,
        productId: body.id,
        name: 'Mouse',
        unitPriceCents: 1999,
        quantity: 1,
      }),
    );

    const res = await http().delete(`/products/${body.id}`).set(bearer(admin)).expect(409);
    expect(res.body).toEqual({ message: 'Product has been ordered' });
    await http().get(`/products/${body.id}`).expect(200);
  });

  describe('GET /products', () => {
    beforeEach(async () => {
      const books = (
        await http().post('/categories').set(bearer(admin)).send({ name: 'Books' })
      ).body.id;

      await create({ name: 'Cheap Pen', description: 'Writes', priceCents: 100, stock: 5 });
      await create({ name: 'Fancy Pen', description: 'Writes well', priceCents: 900, stock: 5 });
      await create({ name: 'Notebook', description: 'Paper', priceCents: 500, stock: 0, categoryId: books });
      await create({ name: 'Atlas', description: '100% accurate_maps', priceCents: 2500, stock: 2, categoryId: books });
    });

    it('returns the envelope with defaults, newest first, without a token', async () => {
      const res = await http().get('/products').expect(200);
      expect(names(res)).toEqual(['Atlas', 'Notebook', 'Fancy Pen', 'Cheap Pen']);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1 });
      expect(res.body.data[0].category).toBeUndefined();
    });

    it('searches name and description case-insensitively', async () => {
      expect(names(await http().get('/products?q=PEN&sort=price_desc'))).toEqual(['Fancy Pen', 'Cheap Pen']);
      expect(names(await http().get('/products?q=paper'))).toEqual(['Notebook']);
      expect(names(await http().get('/products?q=writes+well'))).toEqual(['Fancy Pen']);
      expect(names(await http().get('/products?q=zzz'))).toEqual([]);
    });

    it('treats % and _ in the search as plain characters', async () => {
      expect(names(await http().get('/products?q=%25'))).toEqual(['Atlas']);
      expect(names(await http().get('/products?q=_'))).toEqual(['Atlas']);
      expect(names(await http().get('/products?q=n_t'))).toEqual([]);
    });

    it('filters by category, price range and stock', async () => {
      const books = (await http().get('/categories')).body.find((c: { name: string }) => c.name === 'Books').id;

      expect(names(await http().get(`/products?categoryId=${books}&sort=name`))).toEqual(['Atlas', 'Notebook']);
      expect(names(await http().get('/products?minPrice=200&maxPrice=600'))).toEqual(['Notebook']);
      expect(names(await http().get('/products?minPrice=500&maxPrice=900&sort=name'))).toEqual(['Fancy Pen', 'Notebook']);
      expect(names(await http().get('/products?maxPrice=100'))).toEqual(['Cheap Pen']);
      expect((await http().get('/products?inStock=true')).body.meta.total).toBe(3);
      expect(names(await http().get(`/products?q=pen&inStock=true&categoryId=${categoryId}&sort=name`))).toEqual([
        'Cheap Pen',
        'Fancy Pen',
      ]);
    });

    it('sorts by price and name', async () => {
      expect(names(await http().get('/products?sort=price_asc'))).toEqual(['Cheap Pen', 'Notebook', 'Fancy Pen', 'Atlas']);
      expect(names(await http().get('/products?sort=price_desc'))).toEqual(['Atlas', 'Fancy Pen', 'Notebook', 'Cheap Pen']);
      expect(names(await http().get('/products?sort=name'))).toEqual(['Atlas', 'Cheap Pen', 'Fancy Pen', 'Notebook']);
    });

    it('paginates with consistent meta and no overlap', async () => {
      const page1 = await http().get('/products?sort=name&limit=3&page=1');
      const page2 = await http().get('/products?sort=name&limit=3&page=2');
      const page3 = await http().get('/products?sort=name&limit=3&page=3');

      expect(names(page1)).toEqual(['Atlas', 'Cheap Pen', 'Fancy Pen']);
      expect(names(page2)).toEqual(['Notebook']);
      expect(names(page3)).toEqual([]);
      expect(page1.body.meta).toEqual({ page: 1, limit: 3, total: 4, totalPages: 2 });
      expect(page3.body.meta.total).toBe(4);
    });

    it('rejects bad query values', async () => {
      for (const query of [
        'minPrice=900&maxPrice=100',
        'limit=1000',
        'limit=0',
        'page=0',
        'page=abc',
        'sort=cheapest',
        'inStock=false',
        'categoryId=0',
        'minPrice=-1',
        'minPrice=1.5',
      ]) {
        const res = await http().get(`/products?${query}`).expect(400);
        expect(res.body.message).toBe('Validation failed');
      }
    });
  });
});
