/**
 * Penjaga endpoint yang butuh masuk: membaca cookie sesi, memastikan sesinya
 * aktif, lalu menaruh akun di request untuk `@CurrentAccount()`. Tanpa sesi
 * yang sah dijawab 401.
 */
import { createParamDecorator, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthResponse } from './auth.types.js';
import { readSessionToken } from './session-token.js';

export type SignedInRequest = Request & { account?: AuthResponse & { userId: number } };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SignedInRequest>();
    const current = await this.auth.current(readSessionToken(req.headers.cookie));
    if (!current) throw new UnauthorizedException('Masuk dulu untuk melanjutkan. Sesi tidak ada, sudah keluar, atau kedaluwarsa.');
    req.account = { ...current, userId: Number(current.user.id) };
    return true;
  }
}

/** Akun yang sedang masuk; hanya dipakai di handler yang dijaga `SessionGuard`. */
export const CurrentAccount = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const account = context.switchToHttp().getRequest<SignedInRequest>().account;
  if (!account) throw new UnauthorizedException('Masuk dulu untuk melanjutkan.');
  return account;
});
