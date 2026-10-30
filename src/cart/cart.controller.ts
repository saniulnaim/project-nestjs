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
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { idPipe } from '../common/pipes/id.pipe.js';
import { StandardSchemaPipe } from '../common/pipes/standard-schema.pipe.js';
import { CartService } from './cart.service.js';
import {
  addCartItemSchema,
  updateCartItemSchema,
  type AddCartItemDto,
  type UpdateCartItemDto,
} from './dto/cart.dto.js';

// Every route works on the caller's own cart.
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.cartService.getCart(user.id);
  }

  @Delete()
  @HttpCode(204)
  clear(@CurrentUser() user: AuthUser) {
    return this.cartService.clear(user.id);
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AuthUser,
    @Body(new StandardSchemaPipe(addCartItemSchema)) dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(user.id, dto.productId, dto.quantity);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId', idPipe('cart item')) itemId: number,
    @Body(new StandardSchemaPipe(updateCartItemSchema)) dto: UpdateCartItemDto,
  ) {
    return this.cartService.setQuantity(user.id, itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  @HttpCode(204)
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId', idPipe('cart item')) itemId: number,
  ) {
    return this.cartService.removeItem(user.id, itemId);
  }
}
