import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service.js';

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(() => {
    service = new TasksService();
  });

  it('lists seeded tasks and filters by completed', () => {
    expect(service.findAll()).toHaveLength(2);
    expect(service.findAll(true)).toHaveLength(1);
    expect(service.findAll(false)[0].completed).toBe(false);
  });

  it('creates an incomplete task with the next id', () => {
    expect(service.create({ title: 'New' })).toEqual({
      id: 3,
      title: 'New',
      completed: false,
    });
  });

  it('updates a task', () => {
    expect(service.update(1, { completed: false }).completed).toBe(false);
  });

  it('removes a task and throws afterwards', () => {
    service.remove(1);
    expect(() => service.findOne(1)).toThrow(NotFoundException);
  });
});
