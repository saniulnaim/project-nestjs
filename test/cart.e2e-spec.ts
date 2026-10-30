import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Cart } from './../src/cart/entities/cart.entity.js';
import { Product } from './../src/products/entities/product.entity.js';
import {
  bearer,
  createProduct,
  createTestApp,
  loginAdmin,
  registerCustomer,
} from './helpers.js';

describe('Cart (e2e)', () => {
  let app: INestApplication;
  let admin: string;
  let jane: string;

  beforeEach(async () => {
    app = await createTestApp();
    admin = await loginAdmin(app);
    jane = await registerCustomer(app);
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const add = (token: string, productId: number, quantity: number) =>
    http().post('/cart/items').set(bearer(token)).send({ productId, quantity });
  const cart = async (token: string) => (await http().get('/cart').set(bearer(token))).body;

  it('requires a token on every route', async () => {
    await http().get('/cart').expect(401);
    await http().delete('/cart').expect(401);
    await http().post('/cart/items').send({ productId: 1, quantity: 1 }).expect(401);
    await http().patch('/cart/items/1').send({ quantity: 1 }).expect(401);
    await http().delete('/cart/items/1').expect(401);
  });

  it('starts empty without creating anything', async () => {
    expect(await cart(jane)).toEqual({ items: [], totalCents: 0 });
    expect(await app.get(DataSource).getRepository(Cart).count()).toBe(0);
  });

  it('adds items, totals lines, and merges repeated adds into one line', async () => {
    const mouse = await createProduct(app, admin, { stock: 10, priceCents: 1999 });
    const pen = await createProduct(app, admin, { name: 'Pen', stock: 10, priceCents: 150 });

    const first = await add(jane, mouse.id, 2).expect(201);
    expect(first.body).toEqual({
      items: [
        {
          id: expect.any(Number),
          productId: mouse.id,
          name: 'Mouse',
          unitPriceCents: 1999,
          quantity: 2,
          lineTotalCents: 3998,
        },
      ],
      totalCents: 3998,
    });

    await add(jane, pen.id, 3).expect(201);
    const merged = await add(jane, mouse.id, 1).expect(201);

    expect(merged.body.items.map((i: { productId: number; quantity: number }) => [i.productId, i.quantity])).toEqual([
      [mouse.id, 3],
      [pen.id, 3],
    ]);
    expect(merged.body.totalCents).toBe(3 * 1999 + 3 * 150);
  });

  it('prices lines at the current product price', async () => {
    const mouse = await createProduct(app, admin, { priceCents: 1000 });
    await add(jane, mouse.id, 2).expect(201);

    await http().patch(`/products/${mouse.id}`).set(bearer(admin)).send({ priceCents: 1500 });

    expect((await cart(jane)).totalCents).toBe(3000);
  });

  it('rejects unknown products and over-stock quantities', async () => {
    const mouse = await createProduct(app, admin, { stock: 3 });

    expect((await add(jane, 999, 1).expect(404)).body).toEqual({ message: 'Product not found' });

    await add(jane, mouse.id, 4).expect(409);
    await add(jane, mouse.id, 2).expect(201);
    const over = await add(jane, mouse.id, 2).expect(409);
    expect(over.body).toEqual({ message: 'Insufficient stock' });
    expect((await cart(jane)).items[0].quantity).toBe(2);

    await createProduct(app, admin, { name: 'Gone', stock: 0 }).then((p) =>
      add(jane, p.id, 1).expect(409),
    );
  });

  it('rejects invalid bodies', async () => {
    const bad: object[] = [
      {},
      { productId: 1 },
      { quantity: 1 },
      { productId: 1, quantity: 0 },
      { productId: 1, quantity: 100 },
      { productId: 1, quantity: 1.5 },
      { productId: '1', quantity: 1 },
      { productId: 0, quantity: 1 },
      { productId: 1, quantity: 1, extra: true },
    ];

    for (const body of bad) {
      const res = await http().post('/cart/items').set(bearer(jane)).send(body).expect(400);
      expect(res.body.message).toBe('Validation failed');
    }
  });

  it('sets a line quantity within stock', async () => {
    const mouse = await createProduct(app, admin, { stock: 5 });
    const itemId = (await add(jane, mouse.id, 1)).body.items[0].id;
    const patch = (id: number | string, body: object) =>
      http().patch(`/cart/items/${id}`).set(bearer(jane)).send(body);

    const res = await patch(itemId, { quantity: 5 }).expect(200);
    expect(res.body.items[0]).toMatchObject({ quantity: 5, lineTotalCents: 5 * 1999 });

    expect((await patch(itemId, { quantity: 6 }).expect(409)).body).toEqual({
      message: 'Insufficient stock',
    });
    await patch(itemId, { quantity: 0 }).expect(400);
    await patch(itemId, {}).expect(400);
    await patch(999, { quantity: 1 }).expect(404);
    expect((await patch('abc', { quantity: 1 }).expect(400)).body).toEqual({
      message: 'Invalid cart item ID',
    });
  });

  it("never exposes or changes another user's cart", async () => {
    const mouse = await createProduct(app, admin);
    const bob = await registerCustomer(app, 'bob@example.com');
    const itemId = (await add(jane, mouse.id, 1)).body.items[0].id;

    expect(await cart(bob)).toEqual({ items: [], totalCents: 0 });
    await http().patch(`/cart/items/${itemId}`).set(bearer(bob)).send({ quantity: 2 }).expect(404);
    const stolen = await http().delete(`/cart/items/${itemId}`).set(bearer(bob)).expect(404);
    expect(stolen.body).toEqual({ message: 'Cart item not found' });

    expect((await cart(jane)).items).toHaveLength(1);
  });

  it('removes one line, then clears the rest', async () => {
    const mouse = await createProduct(app, admin);
    const pen = await createProduct(app, admin, { name: 'Pen' });
    await add(jane, mouse.id, 1);
    const items = (await add(jane, pen.id, 1)).body.items;

    await http().delete(`/cart/items/${items[0].id}`).set(bearer(jane)).expect(204);
    expect((await cart(jane)).items.map((i: { productId: number }) => i.productId)).toEqual([pen.id]);

    await http().delete('/cart').set(bearer(jane)).expect(204);
    expect(await cart(jane)).toEqual({ items: [], totalCents: 0 });
    await http().delete('/cart').set(bearer(jane)).expect(204);
  });

  it('drops a line when its product is deleted', async () => {
    const mouse = await createProduct(app, admin);
    await add(jane, mouse.id, 1);

    await http().delete(`/products/${mouse.id}`).set(bearer(admin)).expect(204);

    expect(await cart(jane)).toEqual({ items: [], totalCents: 0 });
    expect(await app.get(DataSource).getRepository(Product).count()).toBe(0);
  });
});
