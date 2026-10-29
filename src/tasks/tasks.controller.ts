import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StandardSchemaPipe } from '../common/pipes/standard-schema.pipe.js';
import { createTaskSchema, type CreateTaskDto } from './dto/create-task.dto.js';
import { updateTaskSchema, type UpdateTaskDto } from './dto/update-task.dto.js';
import {
  listTasksQuerySchema,
  taskIdSchema,
  type ListTasksQuery,
} from './dto/task-params.dto.js';
import { TasksService } from './tasks.service.js';

const idPipe = () =>
  new StandardSchemaPipe(taskIdSchema, 'Invalid task ID', false);

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@Body(new StandardSchemaPipe(createTaskSchema)) dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  @Get()
  findAll(
    @Query(new StandardSchemaPipe(listTasksQuerySchema)) query: ListTasksQuery,
  ) {
    return this.tasksService.findAll(query.completed);
  }

  @Get(':id')
  findOne(@Param('id', idPipe()) id: number) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', idPipe()) id: number,
    @Body(new StandardSchemaPipe(updateTaskSchema)) dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', idPipe()) id: number) {
    this.tasksService.remove(id);
  }
}
