import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers.js';

describe('Express parity (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('answers unknown routes with a JSON 404', async () => {
    const res = await http().get('/nope').expect(404);
    expect(res.body).toEqual({ message: 'Route not found' });
    await http().post('/products/1/nope').send({}).expect(404);
  });

  it('answers malformed JSON with a 400', async () => {
    const res = await http()
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(res.body).toEqual({ message: 'Invalid JSON body' });
  });
});
