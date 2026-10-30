import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';
import { ROLES_KEY } from './roles.decorator.js';
import type { Role } from '../users/entities/user.entity.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Forbidden');
    }

    return true;
  }
}
