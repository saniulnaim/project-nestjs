import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret, type AuthUser } from './auth-user.js';
import type { Role } from '../users/entities/user.entity.js';

interface JwtPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getJwtSecret(),
      algorithms: ['HS256'],
    });
  }

  // Runs only after the signature and expiry are verified.
  validate(payload: JwtPayload): AuthUser {
    return { id: Number(payload.sub), role: payload.role };
  }
}
