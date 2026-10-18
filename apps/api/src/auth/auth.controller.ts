import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthInputError, parseSignIn, parseSignUp } from './auth-input.js';
import { AuthService, TooManyAttemptsException, type SessionResult } from './auth.service.js';
import type { AuthResponse } from './auth.types.js';
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
 * sedang masuk. Token sesi tidak pernah dikirim di body.
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
  async session(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    res.setHeader('Cache-Control', 'no-store');
    const current = await this.service.current(readSessionToken(req.headers.cookie));
    if (!current) throw new UnauthorizedException('Belum masuk.');
    return current;
  }

  private withCookie(result: SessionResult, req: Request, res: Response): AuthResponse {
    const { token, ...body } = result;
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(new Date(body.session.expiresAt), req.secure || process.env.NODE_ENV === 'production'));
    res.setHeader('Cache-Control', 'no-store');
    return body;
  }
}
