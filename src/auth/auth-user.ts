import type { Role } from '../users/entities/user.entity.js';

/** What the JWT strategy attaches to `request.user`. */
export interface AuthUser {
  id: number;
  role: Role;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return secret;
}
