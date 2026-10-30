import { SetMetadata } from '@nestjs/common';
import type { Role } from '../users/entities/user.entity.js';

export const ROLES_KEY = 'roles';

/** Restrict a route to the given roles. Use together with JwtAuthGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
