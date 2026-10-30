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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { idPipe } from '../common/pipes/id.pipe.js';
import { StandardSchemaPipe } from '../common/pipes/standard-schema.pipe.js';
import { Role } from '../users/entities/user.entity.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
  type CreateProductDto,
  type ListProductsQuery,
  type UpdateProductDto,
} from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @Query(new StandardSchemaPipe(listProductsQuerySchema)) query: ListProductsQuery,
  ) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', idPipe('product')) id: number) {
    return this.productsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body(new StandardSchemaPipe(createProductSchema)) dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id', idPipe('product')) id: number,
    @Body(new StandardSchemaPipe(updateProductSchema)) dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id', idPipe('product')) id: number) {
    return this.productsService.remove(id);
  }
}
