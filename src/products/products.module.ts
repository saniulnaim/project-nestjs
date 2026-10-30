import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Category } from '../categories/entities/category.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Category, OrderItem]), AuthModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
