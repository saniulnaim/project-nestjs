import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { idPipe } from '../common/pipes/id.pipe.js';
import { StandardSchemaPipe } from '../common/pipes/standard-schema.pipe.js';
import { Role } from '../users/entities/user.entity.js';
import {
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  type ListOrdersQuery,
  type UpdateOrderStatusDto,
} from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  checkout(@CurrentUser() user: AuthUser) {
    return this.ordersService.checkout(user.id);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query(new StandardSchemaPipe(listOrdersQuerySchema)) query: ListOrdersQuery,
  ) {
    return this.ordersService.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', idPipe('order')) id: number,
  ) {
    return this.ordersService.findOne(user, id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id', idPipe('order')) id: number,
    @Body(new StandardSchemaPipe(updateOrderStatusSchema)) dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', idPipe('order')) id: number,
  ) {
    return this.ordersService.cancelOwn(user.id, id);
  }
}
