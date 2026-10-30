import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { Category } from './../src/categories/entities/category.entity.js';
import { Product } from './../src/products/entities/product.entity.js';
import { bearer, createTestApp, loginAdmin, registerCustomer } from './helpers.js';

describe('Categories (e2e)', () => {
  let app: INestApplication;
  let admin: string;

  beforeEach(async () => {
    app = await createTestApp();
    admin = await loginAdmin(app);
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const create = (name: string) =>
    http().post('/categories').set(bearer(admin)).send({ name });

  it('lists categories as a plain array sorted by name, without a token', async () => {
    await create('Toys');
    await create('Books');
    await create('Garden');

    const res = await http().get('/categories').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((c: Category) => c.name)).toEqual(['Books', 'Garden', 'Toys']);
  });

  it('returns one category and 404 / 400 for missing / invalid ids', async () => {
    const { body } = await create('Books');

    const one = await http().get(`/categories/${body.id}`).expect(200);
    expect(one.body).toMatchObject({ id: body.id, name: 'Books', slug: 'books' });

    const missing = await http().get('/categories/999').expect(404);
    expect(missing.body).toEqual({ message: 'Category not found' });

    for (const id of ['abc', '0', '-1', '1.5']) {
      const bad = await http().get(`/categories/${id}`).expect(400);
      expect(bad.body).toEqual({ message: 'Invalid category ID' });
    }
  });

  it('only lets admins write', async () => {
    const customer = await registerCustomer(app);
    const { body } = await create('Books');

    await http().post('/categories').send({ name: 'X' }).expect(401);
    await http().patch(`/categories/${body.id}`).send({ name: 'X' }).expect(401);
    await http().delete(`/categories/${body.id}`).expect(401);

    const forbidden = await http()
      .post('/categories')
      .set(bearer(customer))
      .send({ name: 'X' })
      .expect(403);
    expect(forbidden.body).toEqual({ message: 'Forbidden' });
    await http().patch(`/categories/${body.id}`).set(bearer(customer)).send({ name: 'X' }).expect(403);
    await http().delete(`/categories/${body.id}`).set(bearer(customer)).expect(403);
  });

  it('creates a category with a generated slug', async () => {
    const res = await create('  Home Office ').expect(201);
    expect(res.body).toMatchObject({ name: 'Home Office', slug: 'home-office' });
    expect(res.body.createdAt).toBeDefined();
  });

  it('rejects invalid bodies', async () => {
    for (const body of [{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(61) }, { name: 'ok', extra: 1 }]) {
      const res = await http().post('/categories').set(bearer(admin)).send(body).expect(400);
      expect(res.body.message).toBe('Validation failed');
    }
  });

  it('rejects duplicate names, including ones that differ only by case', async () => {
    await create('Home Office').expect(201);

    for (const name of ['Home Office', 'home office', 'HOME-OFFICE']) {
      const res = await create(name).expect(409);
      expect(res.body).toEqual({ message: 'Category already exists' });
    }
  });

  it('renames a category and refreshes the slug', async () => {
    const { body } = await create('Books');
    await create('Toys');

    const res = await http()
      .patch(`/categories/${body.id}`)
      .set(bearer(admin))
      .send({ name: 'Old Books' })
      .expect(200);
    expect(res.body).toMatchObject({ id: body.id, name: 'Old Books', slug: 'old-books' });

    // keeping the same name is not a clash with itself
    await http().patch(`/categories/${body.id}`).set(bearer(admin)).send({ name: 'Old Books' }).expect(200);
    await http().patch(`/categories/${body.id}`).set(bearer(admin)).send({ name: 'toys' }).expect(409);
    await http().patch('/categories/999').set(bearer(admin)).send({ name: 'X' }).expect(404);
    await http().patch(`/categories/${body.id}`).set(bearer(admin)).send({}).expect(400);
  });

  it('deletes an empty category but blocks one that has products', async () => {
    const empty = (await create('Empty')).body;
    const used = (await create('Used')).body;

    const products: Repository<Product> = app.get(getRepositoryToken(Product));
    await products.save(
      products.create({ name: 'Pen', slug: 'pen', priceCents: 100, stock: 1, categoryId: used.id }),
    );

    await http().delete(`/categories/${empty.id}`).set(bearer(admin)).expect(204);
    await http().get(`/categories/${empty.id}`).expect(404);

    const blocked = await http().delete(`/categories/${used.id}`).set(bearer(admin)).expect(409);
    expect(blocked.body).toEqual({ message: 'Category has products' });
    await http().get(`/categories/${used.id}`).expect(200);

    await http().delete('/categories/999').set(bearer(admin)).expect(404);
  });
});
