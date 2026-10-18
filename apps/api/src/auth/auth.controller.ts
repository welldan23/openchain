import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthInputError, parseSignIn, parseSignUp } from './auth-input.js';
import { AuthService, TooManyAttemptsException, type SessionResult } from './auth.service.js';
import type { AuthResponse } from './auth.types.js';
import { CurrentAccount, SessionGuard, type SignedInRequest } from './session.guard.js';
import { readSessionToken, SESSION_COOKIE, sessionCookieOptions } from './session-token.js';

function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof AuthInputError) throw new BadRequestException(error.message);
    throw error;
  }
}

/**
 * Akun: `POST /auth/sign-up` (201) dan `POST /auth/sign-in` membuat sesi
 * dan memasang cookie HttpOnly; `GET /auth/session` memberi pengguna yang
 * sedang masuk; `POST /auth/sign-out` dan `/auth/sign-out-all` keluar dari
 * perangkat ini atau semua perangkat. Token sesi tidak pernah dikirim di body.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('sign-up')
  async signUp(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    return this.withCookie(await this.service.signUp(parsed(() => parseSignUp(body))), req, res);
  }

  @Post('sign-in')
  @HttpCode(200)
  async signIn(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    try {
      return this.withCookie(await this.service.signIn(parsed(() => parseSignIn(body))), req, res);
    } catch (error) {
      if (error instanceof TooManyAttemptsException) res.setHeader('Retry-After', String(error.retryAfterSeconds));
      throw error;
    }
  }

  @Get('session')
  @UseGuards(SessionGuard)
  session(@CurrentAccount() account: NonNullable<SignedInRequest['account']>, @Res({ passthrough: true }) res: Response): AuthResponse {
    res.setHeader('Cache-Control', 'no-store');
    return { user: account.user, session: account.session };
  }

  /** Keluar dari perangkat ini: sesi dicabut dan cookie dihapus. Aman dipanggil berulang. */
  @Post('sign-out')
  @HttpCode(204)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.service.signOut(readSessionToken(req.headers.cookie));
    this.clearCookie(req, res);
  }

  /** Keluar dari semua perangkat, termasuk yang ini. */
  @Post('sign-out-all')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async signOutAll(@CurrentAccount() account: NonNullable<SignedInRequest['account']>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.service.signOutEverywhere(account.userId);
    this.clearCookie(req, res);
  }

  private clearCookie(req: Request, res: Response): void {
    const { expires: _expires, ...options } = sessionCookieOptions(new Date(0), req.secure || process.env.NODE_ENV === 'production');
    res.clearCookie(SESSION_COOKIE, options);
    res.setHeader('Cache-Control', 'no-store');
  }

  private withCookie(result: SessionResult, req: Request, res: Response): AuthResponse {
    const { token, ...body } = result;
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(new Date(body.session.expiresAt), req.secure || process.env.NODE_ENV === 'production'));
    res.setHeader('Cache-Control', 'no-store');
    return body;
  }
}
