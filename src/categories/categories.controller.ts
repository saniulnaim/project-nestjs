import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { idPipe } from '../common/pipes/id.pipe.js';
import { StandardSchemaPipe } from '../common/pipes/standard-schema.pipe.js';
import { Role } from '../users/entities/user.entity.js';
import { CategoriesService } from './categories.service.js';
import { categorySchema, type CategoryDto } from './dto/category.dto.js';

const categoryBody = () => new StandardSchemaPipe(categorySchema);

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', idPipe('category')) id: number) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body(categoryBody()) dto: CategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id', idPipe('category')) id: number,
    @Body(categoryBody()) dto: CategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id', idPipe('category')) id: number) {
    return this.categoriesService.remove(id);
  }
}
