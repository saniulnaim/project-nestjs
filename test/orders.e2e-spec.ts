import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CartItem } from './../src/cart/entities/cart-item.entity.js';
import { Order } from './../src/orders/entities/order.entity.js';
import { Product } from './../src/products/entities/product.entity.js';
import {
  bearer,
  createProduct,
  createTestApp,
  loginAdmin,
  registerCustomer,
} from './helpers.js';

describe('Orders (e2e)', () => {
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
  const db = () => app.get(DataSource);
  const stockOf = async (id: number) =>
    (await db().getRepository(Product).findOneByOrFail({ id })).stock;

  const add = (token: string, productId: number, quantity: number) =>
    http().post('/cart/items').set(bearer(token)).send({ productId, quantity });
  const checkout = (token: string) => http().post('/orders').set(bearer(token));
  const setStatus = (id: number, status: string) =>
    http().patch(`/orders/${id}/status`).set(bearer(admin)).send({ status });

  /** A customer with one order for `quantity` of a fresh product. */
  async function placeOrder(token = jane, product?: { id: number }, quantity = 1) {
    const target = product ?? (await createProduct(app, admin, { stock: 10 }));
    await add(token, target.id, quantity).expect(201);
    return (await checkout(token).expect(201)).body as {
      id: number;
      status: string;
      totalCents: number;
      items: unknown[];
    };
  }

  it('requires a token on every route', async () => {
    await http().post('/orders').expect(401);
    await http().get('/orders').expect(401);
    await http().get('/orders/1').expect(401);
    await http().patch('/orders/1/status').send({ status: 'PAID' }).expect(401);
    await http().post('/orders/1/cancel').expect(401);
  });

  describe('checkout', () => {
    it('creates a pending order, takes stock and empties the cart', async () => {
      const mouse = await createProduct(app, admin, { stock: 5 });
      const pen = await createProduct(app, admin, { name: 'Pen', stock: 8, priceCents: 150 });
      await add(jane, mouse.id, 2);
      await add(jane, pen.id, 3);

      const res = await checkout(jane).expect(201);

      expect(res.body).toEqual({
        id: expect.any(Number),
        userId: expect.any(Number),
        status: 'PENDING',
        totalCents: 2 * 1999 + 3 * 150,
        items: [
          { productId: mouse.id, name: 'Mouse', unitPriceCents: 1999, quantity: 2 },
          { productId: pen.id, name: 'Pen', unitPriceCents: 150, quantity: 3 },
        ],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(await stockOf(mouse.id)).toBe(3);
      expect(await stockOf(pen.id)).toBe(5);
      expect((await http().get('/cart').set(bearer(jane))).body.items).toEqual([]);
    });

    it('rejects an empty cart', async () => {
      const res = await checkout(jane).expect(409);
      expect(res.body).toEqual({ message: 'Cart is empty' });
      expect(await db().getRepository(Order).count()).toBe(0);
    });

    it('can buy the last unit but not more', async () => {
      const last = await createProduct(app, admin, { stock: 2 });
      await placeOrder(jane, last, 2);
      expect(await stockOf(last.id)).toBe(0);
      await add(jane, last.id, 1).expect(409);
    });

    it('keeps the price and name it had at checkout', async () => {
      const mouse = await createProduct(app, admin, { priceCents: 1999 });
      const order = await placeOrder(jane, mouse, 2);

      await http()
        .patch(`/products/${mouse.id}`)
        .set(bearer(admin))
        .send({ priceCents: 5000, name: 'Renamed' });

      const reread = await http().get(`/orders/${order.id}`).set(bearer(jane)).expect(200);
      expect(reread.body.totalCents).toBe(3998);
      expect(reread.body.items[0]).toMatchObject({ name: 'Mouse', unitPriceCents: 1999 });
    });

    it('rolls everything back when one line is short', async () => {
      const plenty = await createProduct(app, admin, { name: 'Plenty', stock: 10 });
      const scarce = await createProduct(app, admin, { name: 'Scarce', stock: 2 });
      await add(jane, plenty.id, 1);
      await add(jane, scarce.id, 2);

      // stock drops after the items were added to the cart
      await db().getRepository(Product).update(scarce.id, { stock: 1 });

      const res = await checkout(jane).expect(409);
      expect(res.body).toEqual({ message: 'Insufficient stock for Scarce' });

      expect(await stockOf(plenty.id)).toBe(10);
      expect(await stockOf(scarce.id)).toBe(1);
      expect(await db().getRepository(Order).count()).toBe(0);
      expect((await http().get('/cart').set(bearer(jane))).body.items).toHaveLength(2);
    });

    it('lets only one of two simultaneous checkouts take the last stock', async () => {
      const bob = await registerCustomer(app, 'bob@example.com');
      const last = await createProduct(app, admin, { stock: 1 });
      await add(jane, last.id, 1).expect(201);
      await add(bob, last.id, 1).expect(201);

      const results = await Promise.all([checkout(jane), checkout(bob)]);

      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(await stockOf(last.id)).toBe(0);
      expect(await db().getRepository(Order).count()).toBe(1);
      // the loser keeps their cart
      expect(await db().getRepository(CartItem).count()).toBe(1);
    });
  });

  it("keeps a successful checkout when another one fails and rolls back at the same time", async () => {
    const bob = await registerCustomer(app, 'bob@example.com');
    const plenty = await createProduct(app, admin, { name: 'Plenty', stock: 10 });
    const scarce = await createProduct(app, admin, { name: 'Scarce', stock: 5 });

    await add(jane, plenty.id, 1).expect(201);
    // bob's second line fails after the first line already took stock
    await add(bob, plenty.id, 2).expect(201);
    await add(bob, scarce.id, 2).expect(201);
    await db().getRepository(Product).update(scarce.id, { stock: 1 });

    const [janes, bobs] = await Promise.all([checkout(jane), checkout(bob)]);

    expect(janes.status).toBe(201);
    expect(bobs.status).toBe(409);
    expect(await stockOf(plenty.id)).toBe(9);
    expect(await stockOf(scarce.id)).toBe(1);
    expect(await db().getRepository(Order).count()).toBe(1);
    expect(
      (await db().getRepository(Order).findOneByOrFail({ id: janes.body.id })).status,
    ).toBe('PENDING');
  });

  describe('reading orders', () => {
    it('shows customers only their own orders, admins everything', async () => {
      const bob = await registerCustomer(app, 'bob@example.com');
      const janes = await placeOrder(jane);
      await placeOrder(bob);

      const mine = await http().get('/orders').set(bearer(jane)).expect(200);
      expect(mine.body.data.map((o: { id: number }) => o.id)).toEqual([janes.id]);
      expect(mine.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });

      expect((await http().get('/orders').set(bearer(admin))).body.meta.total).toBe(2);
    });

    it("hides other people's orders behind a 404", async () => {
      const bob = await registerCustomer(app, 'bob@example.com');
      const order = await placeOrder(jane);

      await http().get(`/orders/${order.id}`).set(bearer(jane)).expect(200);
      await http().get(`/orders/${order.id}`).set(bearer(admin)).expect(200);
      const hidden = await http().get(`/orders/${order.id}`).set(bearer(bob)).expect(404);
      expect(hidden.body).toEqual({ message: 'Order not found' });

      await http().get('/orders/999').set(bearer(jane)).expect(404);
      expect((await http().get('/orders/abc').set(bearer(jane)).expect(400)).body).toEqual({
        message: 'Invalid order ID',
      });
    });

    it('lists newest first, paginates and filters by status', async () => {
      const product = await createProduct(app, admin, { stock: 50 });
      const ids: number[] = [];
      for (let i = 0; i < 3; i++) ids.push((await placeOrder(jane, product)).id);
      await setStatus(ids[0]!, 'PAID').expect(200);

      const all = await http().get('/orders?limit=2').set(bearer(jane)).expect(200);
      expect(all.body.data.map((o: { id: number }) => o.id)).toEqual([ids[2], ids[1]]);
      expect(all.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

      const page2 = await http().get('/orders?limit=2&page=2').set(bearer(jane));
      expect(page2.body.data.map((o: { id: number }) => o.id)).toEqual([ids[0]]);

      const paid = await http().get('/orders?status=PAID').set(bearer(jane));
      expect(paid.body.data.map((o: { id: number }) => o.id)).toEqual([ids[0]]);
      expect((await http().get('/orders?status=SHIPPED').set(bearer(jane))).body.meta.total).toBe(0);
    });

    it('rejects bad list queries', async () => {
      for (const query of ['status=LOST', 'page=0', 'limit=101']) {
        await http().get(`/orders?${query}`).set(bearer(jane)).expect(400);
      }
    });
  });

  describe('status changes', () => {
    it('is admin only', async () => {
      const order = await placeOrder();
      const res = await http()
        .patch(`/orders/${order.id}/status`)
        .set(bearer(jane))
        .send({ status: 'PAID' })
        .expect(403);
      expect(res.body).toEqual({ message: 'Forbidden' });
    });

    it('walks PENDING -> PAID -> SHIPPED -> DELIVERED', async () => {
      const order = await placeOrder();

      for (const status of ['PAID', 'SHIPPED', 'DELIVERED']) {
        expect((await setStatus(order.id, status).expect(200)).body.status).toBe(status);
      }
    });

    it('refuses every move outside the allowed transitions', async () => {
      const allowed: Record<string, string[]> = {
        PENDING: ['PAID', 'CANCELLED'],
        PAID: ['SHIPPED', 'CANCELLED'],
        SHIPPED: ['DELIVERED'],
        DELIVERED: [],
        CANCELLED: [],
      };
      const all = Object.keys(allowed);
      const product = await createProduct(app, admin, { stock: 100 });
      const orders = db().getRepository(Order);

      for (const [from, next] of Object.entries(allowed)) {
        const order = await placeOrder(jane, product);
        await orders.update(order.id, { status: from as Order['status'] });

        for (const target of all.filter((s) => !next.includes(s))) {
          const res = await setStatus(order.id, target).expect(409);
          expect(res.body).toEqual({ message: 'Invalid status transition' });
        }
        expect((await orders.findOneByOrFail({ id: order.id })).status).toBe(from);
      }
    });

    it('validates the body and the order', async () => {
      const order = await placeOrder();
      const patch = (id: number | string, body: object) =>
        http().patch(`/orders/${id}/status`).set(bearer(admin)).send(body);

      await patch(order.id, { status: 'LOST' }).expect(400);
      await patch(order.id, {}).expect(400);
      await patch(order.id, { status: 'PAID', extra: 1 }).expect(400);
      await patch(999, { status: 'PAID' }).expect(404);
      await patch('abc', { status: 'PAID' }).expect(400);
    });

    it('puts stock back when an admin cancels a paid order', async () => {
      const mouse = await createProduct(app, admin, { stock: 5 });
      const order = await placeOrder(jane, mouse, 3);
      expect(await stockOf(mouse.id)).toBe(2);

      await setStatus(order.id, 'PAID').expect(200);
      expect((await setStatus(order.id, 'CANCELLED').expect(200)).body.status).toBe('CANCELLED');
      expect(await stockOf(mouse.id)).toBe(5);

      // cancelling again must not restore stock twice
      await setStatus(order.id, 'CANCELLED').expect(409);
      expect(await stockOf(mouse.id)).toBe(5);
    });
  });

  describe('cancelling your own order', () => {
    it('cancels a pending order and restores stock', async () => {
      const mouse = await createProduct(app, admin, { stock: 5 });
      const order = await placeOrder(jane, mouse, 2);

      const res = await http().post(`/orders/${order.id}/cancel`).set(bearer(jane)).expect(200);

      expect(res.body.status).toBe('CANCELLED');
      expect(await stockOf(mouse.id)).toBe(5);
      await http().post(`/orders/${order.id}/cancel`).set(bearer(jane)).expect(409);
      expect(await stockOf(mouse.id)).toBe(5);
    });

    it('refuses once the order is paid', async () => {
      const order = await placeOrder();
      await setStatus(order.id, 'PAID').expect(200);

      const res = await http().post(`/orders/${order.id}/cancel`).set(bearer(jane)).expect(409);
      expect(res.body).toEqual({ message: 'Invalid status transition' });
    });

    it("treats someone else's order, even for an admin, as not found", async () => {
      const bob = await registerCustomer(app, 'bob@example.com');
      const order = await placeOrder();

      await http().post(`/orders/${order.id}/cancel`).set(bearer(bob)).expect(404);
      await http().post(`/orders/${order.id}/cancel`).set(bearer(admin)).expect(404);
      await http().post('/orders/999/cancel').set(bearer(jane)).expect(404);
      await http().post('/orders/abc/cancel').set(bearer(jane)).expect(400);
    });
  });
});
