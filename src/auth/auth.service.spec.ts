import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;

  const users = {
    findByEmail: jest.fn(),
    verifyPassword: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
  };
  const tokens = {
    issueTokenPair: jest.fn(),
  };
  const fakePair = { accessToken: 'a', refreshToken: 'r' };

  beforeEach(async () => {
    jest.clearAllMocks();
    tokens.issueTokenPair.mockResolvedValue(fakePair);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: TokenService, useValue: tokens },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('deve rejeitar login quando o usuário não existe', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(
      service.login({ email: 'x@x.com', password: '123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deve rejeitar login quando a senha está errada', async () => {
    users.findByEmail.mockResolvedValue({ passwordHash: 'h' });
    users.verifyPassword.mockResolvedValue(false);
    await expect(
      service.login({ email: 'x@x.com', password: 'errada' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deve emitir par de tokens em login válido', async () => {
    users.findByEmail.mockResolvedValue({ id: '1', passwordHash: 'h' });
    users.verifyPassword.mockResolvedValue(true);
    const result = await service.login({ email: 'x@x.com', password: 'certa' });
    expect(result).toEqual(fakePair);
    expect(tokens.issueTokenPair).toHaveBeenCalledTimes(1);
  });
});
