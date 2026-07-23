import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { User } from '../users/user.entity';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  private readonly redis: Redis;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
    });
  }

  async issueTokenPair(user: User): Promise<TokenPair> {
    const jti = uuidv4();
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL', '15m'),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_TTL', '7d'),
      },
    );
    await this.storeRefreshJti(user.id, jti);
    return { accessToken, refreshToken };
  }

  private refreshKey(userId: string, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }

  private async storeRefreshJti(userId: string, jti: string): Promise<void> {
    const ttlSeconds = 7 * 24 * 60 * 60;
    await this.redis.set(this.refreshKey(userId, jti), '1', 'EX', ttlSeconds);
  }

  async isRefreshValid(userId: string, jti: string): Promise<boolean> {
    const exists = await this.redis.exists(this.refreshKey(userId, jti));
    return exists === 1;
  }

  async revokeRefresh(userId: string, jti: string): Promise<void> {
    await this.redis.del(this.refreshKey(userId, jti));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const keys = await this.redis.keys(`refresh:${userId}:*`);
    if (keys.length) await this.redis.del(...keys);
  }
}
