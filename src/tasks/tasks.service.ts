import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';
import type { Task } from './entities/task.entity.js';

const seedTasks = (): Task[] => [
  { id: 1, title: 'Learn NestJS modules', completed: true },
  { id: 2, title: 'Build a REST API', completed: false },
];

@Injectable()
export class TasksService {
  private tasks: Task[] = seedTasks();
  private nextId = this.tasks.length + 1;

  reset(): void {
    this.tasks = seedTasks();
    this.nextId = this.tasks.length + 1;
  }

  findAll(completed?: boolean): Task[] {
    return completed === undefined
      ? [...this.tasks]
      : this.tasks.filter((task) => task.completed === completed);
  }

  findOne(id: number): Task {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  create(dto: CreateTaskDto): Task {
    const task: Task = { id: this.nextId++, title: dto.title, completed: false };
    this.tasks.push(task);
    return task;
  }

  update(id: number, dto: UpdateTaskDto): Task {
    return Object.assign(this.findOne(id), dto);
  }

  remove(id: number): void {
    const task = this.findOne(id);
    this.tasks = this.tasks.filter((t) => t !== task);
  }
}
