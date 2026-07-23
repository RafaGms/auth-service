import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { RegisterDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.users.create(dto.email, dto.password);
    return this.tokens.issueTokenPair(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const ok = await this.users.verifyPassword(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return this.tokens.issueTokenPair(user);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const valid = await this.tokens.isRefreshValid(payload.sub, payload.jti);
    if (!valid) {
      throw new UnauthorizedException('Refresh token revogado ou expirado');
    }

    await this.tokens.revokeRefresh(payload.sub, payload.jti);

    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    return this.tokens.issueTokenPair(user);
  }

  async logout(userId: string) {
    await this.tokens.revokeAllForUser(userId);
    return { message: 'Logout efetuado em todos os dispositivos' };
  }
}
