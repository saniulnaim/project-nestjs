import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';

const toPublicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (await this.users.existsBy({ email: dto.email })) {
      throw new ConflictException('Email already registered');
    }

    const user = await this.users
      .save(
        this.users.create({
          email: dto.email,
          name: dto.name,
          passwordHash: await bcrypt.hash(dto.password, 10),
        }),
      )
      .catch((error: { code?: string }) => {
        // two simultaneous sign-ups can both pass the check above
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new ConflictException('Email already registered');
        }
        throw error;
      });

    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOneBy({ email: dto.email });
    const valid =
      user !== null && (await bcrypt.compare(dto.password, user.passwordHash));

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.session(user);
  }

  async getProfile(id: number) {
    const user = await this.users.findOneBy({ id });

    if (!user) {
      // the token is valid but the account no longer exists
      throw new UnauthorizedException('Unauthorized');
    }

    return toPublicUser(user);
  }

  private async session(user: User) {
    return {
      user: toPublicUser(user),
      token: await this.jwt.signAsync(
        { role: user.role },
        { subject: String(user.id) },
      ),
    };
  }
}
