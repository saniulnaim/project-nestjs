import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { StandardSchemaPipe } from '../common/pipes/standard-schema.pipe.js';
import type { AuthUser } from './auth-user.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import {
  loginSchema,
  registerSchema,
  type LoginDto,
  type RegisterDto,
} from './dto/auth.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body(new StandardSchemaPipe(registerSchema)) dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body(new StandardSchemaPipe(loginSchema)) dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getProfile(user.id);
  }
}
