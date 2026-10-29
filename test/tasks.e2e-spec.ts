import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/filters/http-exception.filter.js';
import { TasksService } from './../src/tasks/tasks.service.js';

describe('Tasks (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    app.get(TasksService).reset();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('GET /tasks returns all tasks', async () => {
    const res = await http().get('/tasks').expect(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET /tasks?completed=true filters', async () => {
    const res = await http().get('/tasks?completed=true').expect(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /tasks/:id returns 404 for missing and 400 for invalid', async () => {
    const missing = await http().get('/tasks/999').expect(404);
    expect(missing.body).toEqual({ message: 'Task not found' });
    const invalid = await http().get('/tasks/abc').expect(400);
    expect(invalid.body).toEqual({ message: 'Invalid task ID' });
  });

  it('POST /tasks creates a task and rejects bad bodies', async () => {
    const res = await http().post('/tasks').send({ title: '  Write tests ' }).expect(201);
    expect(res.body).toMatchObject({ title: 'Write tests', completed: false });
    const bad = await http().post('/tasks').send({ title: '' }).expect(400);
    expect(bad.body.message).toBe('Validation failed');
    expect(bad.body.errors).toHaveLength(1);
  });

  it('PATCH /tasks/:id updates and requires a field', async () => {
    const res = await http().patch('/tasks/2').send({ completed: true }).expect(200);
    expect(res.body.completed).toBe(true);
    await http().patch('/tasks/2').send({}).expect(400);
    await http().patch('/tasks/999').send({ completed: true }).expect(404);
  });

  it('DELETE /tasks/:id returns 204 then 404', async () => {
    await http().delete('/tasks/1').expect(204);
    await http().delete('/tasks/1').expect(404);
  });
});
