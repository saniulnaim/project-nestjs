import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

describe('TasksController', () => {
  it('delegates to the service', () => {
    const controller = new TasksController(new TasksService());
    expect(controller.findAll({ completed: undefined })).toHaveLength(2);
    expect(controller.findOne(1).id).toBe(1);
  });
});
