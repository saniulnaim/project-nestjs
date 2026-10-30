import { Controller, Get, UseGuards, type INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { JwtAuthGuard } from './../src/auth/jwt-auth.guard.js';
import { Roles } from './../src/auth/roles.decorator.js';
import { RolesGuard } from './../src/auth/roles.guard.js';
import { AllExceptionsFilter } from './../src/common/filters/http-exception.filter.js';
import { Role, User } from './../src/users/entities/user.entity.js';

// Stands in for the real admin routes (categories, products) built later.
@Controller('probe')
@UseGuards(JwtAuthGuard, RolesGuard)
class ProbeController {
  @Get('any')
  any() {
    return { ok: true };
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  admin() {
    return { ok: true };
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let users: Repository<User>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    users = app.get(getRepositoryToken(User));
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const register = async (email = 'jane@example.com') =>
    (
      await http()
        .post('/auth/register')
        .send({ email, password: 'password123', name: 'Jane' })
    ).body.token as string;

  async function adminToken() {
    await users.save(
      users.create({
        email: 'admin@example.com',
        name: 'Admin',
        role: Role.ADMIN,
        passwordHash: await bcrypt.hash('adminpass1', 10),
      }),
    );
    const res = await http()
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'adminpass1' });
    return res.body.token as string;
  }

  it('registers, logs in and returns the profile without the hash', async () => {
    const created = await http()
      .post('/auth/register')
      .send({ email: ' Jane@Example.com ', password: 'password123', name: 'Jane' })
      .expect(201);

    expect(created.body.user).toMatchObject({
      email: 'jane@example.com',
      role: 'CUSTOMER',
    });
    expect(created.body.user.passwordHash).toBeUndefined();

    const login = await http()
      .post('/auth/login')
      .send({ email: 'jane@example.com', password: 'password123' })
      .expect(200);

    const me = await http().get('/auth/me').set(bearer(login.body.token)).expect(200);
    expect(me.body).toMatchObject({ email: 'jane@example.com', name: 'Jane' });
    expect(me.body.passwordHash).toBeUndefined();
  });

  it('hashes the password and signs a 1 hour HS256 token', async () => {
    const token = await register();
    const stored = await users.findOneByOrFail({ email: 'jane@example.com' });
    expect(stored.passwordHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', stored.passwordHash)).toBe(true);

    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part!, 'base64url').toString()));
    expect(header.alg).toBe('HS256');
    expect(payload).toMatchObject({ sub: String(stored.id), role: 'CUSTOMER' });
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('rejects duplicate emails and invalid input', async () => {
    await register();

    const duplicate = await http()
      .post('/auth/register')
      .send({ email: 'JANE@example.com', password: 'password123', name: 'J' })
      .expect(409);
    expect(duplicate.body).toEqual({ message: 'Email already registered' });

    const invalid = await http()
      .post('/auth/register')
      .send({ email: 'nope', password: 'short', name: '', role: 'ADMIN' })
      .expect(400);
    expect(invalid.body.message).toBe('Validation failed');
    expect(invalid.body.errors.length).toBeGreaterThan(0);
  });

  it('never lets a client choose its own role', async () => {
    await http()
      .post('/auth/register')
      .send({ email: 'x@example.com', password: 'password123', name: 'X', role: 'ADMIN' })
      .expect(400);
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    await register();

    for (const body of [
      { email: 'jane@example.com', password: 'wrong-password' },
      { email: 'ghost@example.com', password: 'password123' },
    ]) {
      const res = await http().post('/auth/login').send(body).expect(401);
      expect(res.body).toEqual({ message: 'Invalid email or password' });
    }

    await http().post('/auth/login').send({ email: 'jane@example.com' }).expect(400);
  });

  it('returns 401 for missing, malformed, tampered and expired tokens', async () => {
    const token = await register();
    const expired = (await import('jsonwebtoken')).default.sign(
      { role: 'CUSTOMER' },
      'test-secret',
      { subject: '1', expiresIn: -10 },
    );
    const wrongSecret = (await import('jsonwebtoken')).default.sign(
      { role: 'ADMIN' },
      'another-secret',
      { subject: '1' },
    );

    const headers: Record<string, string>[] = [
      {},
      { Authorization: 'Bearer' },
      { Authorization: 'Basic abc' },
      bearer('garbage'),
      bearer(`${token}x`),
      bearer(expired),
      bearer(wrongSecret),
    ];

    for (const header of headers) {
      const res = await http().get('/auth/me').set(header).expect(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    }
  });

  it('returns 401 when the token is valid but the account was deleted', async () => {
    const token = await register();
    await users.delete({ email: 'jane@example.com' });
    await http().get('/auth/me').set(bearer(token)).expect(401);
  });

  describe('guards', () => {
    it('JwtAuthGuard requires a token', async () => {
      const token = await register();
      await http().get('/probe/any').expect(401);
      await http().get('/probe/any').set(bearer(token)).expect(200);
    });

    it('RolesGuard returns 403 for the wrong role and 200 for admins', async () => {
      const customer = await register();
      const admin = await adminToken();
      const forbidden = await http().get('/probe/admin').set(bearer(customer)).expect(403);
      expect(forbidden.body).toEqual({ message: 'Forbidden' });

      await http().get('/probe/admin').set(bearer(admin)).expect(200);
    });

    it('checks authentication before the role', async () => {
      await http().get('/probe/admin').expect(401);
    });
  });
});
