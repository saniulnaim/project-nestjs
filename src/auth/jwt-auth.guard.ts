import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from './auth-user.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Passport's default messages leak details ("jwt expired", ...); keep one.
  override handleRequest<T = AuthUser>(err: unknown, user: T | false): T {
    if (err || !user) {
      throw new UnauthorizedException('Unauthorized');
    }

    return user;
  }
}
