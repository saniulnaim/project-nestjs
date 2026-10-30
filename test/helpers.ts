import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/filters/http-exception.filter.js';
import { Role, User } from './../src/users/entities/user.entity.js';

/** A fresh app on its own in-memory database. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function registerCustomer(
  app: INestApplication,
  email = 'jane@example.com',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password123', name: 'Jane' });
  return res.body.token;
}

export async function loginAdmin(app: INestApplication): Promise<string> {
  const users: Repository<User> = app.get(getRepositoryToken(User));
  await users.save(
    users.create({
      email: 'admin@example.com',
      name: 'Admin',
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash('adminpass1', 10),
    }),
  );
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'admin@example.com', password: 'adminpass1' });
  return res.body.token;
}
