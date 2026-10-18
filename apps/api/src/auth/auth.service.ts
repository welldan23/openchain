/**
 * Daftar, masuk, dan membaca sesi. Kata sandi diverifikasi dengan hash
 * scrypt; pesan gagal masuk sama untuk email tak dikenal dan kata sandi
 * salah, dan email tak dikenal tetap menjalankan verifikasi supaya lama
 * respons tidak membocorkan email terdaftar. Setelah 5 kali gagal
 * berturut-turut, akun dikunci 15 menit.
 */
import { ConflictException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException, type OnModuleInit } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { normalizeEmail, type SignInInput, type SignUpInput } from './auth-input.js';
import { AuthRepository, isUniqueViolation, type UserRow } from './auth.repository.js';
import type { AccountView, AuthResponse } from './auth.types.js';
import { hashPassword, needsRehash, verifyPassword } from './password.js';
import { hashSessionToken, newSessionToken, SESSION_TTL_MS } from './session-token.js';

export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_MS = 15 * 60_000;
/** Waktu terakhir dipakai diperbarui paling sering sekali per 5 menit. */
const TOUCH_INTERVAL_MS = 5 * 60_000;
const INVALID = 'Email atau kata sandi salah.';

export class TooManyAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(`Terlalu banyak percobaan masuk yang gagal. Coba lagi dalam ${Math.ceil(retryAfterSeconds / 60)} menit.`, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export interface SessionResult extends AuthResponse {
  /** Token mentah untuk cookie; tidak dikirim di body. */
  token: string;
}

export function toAccountView(user: UserRow): AccountView {
  return { id: String(user.id), email: user.email, displayName: user.displayName, timezone: user.timezone, createdAt: user.createdAt.toISOString() };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly repository: AuthRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Siapkan hash pengganti sejak awal, supaya permintaan pertama dengan email tak dikenal tidak lebih lambat. */
  onModuleInit(): void {
    void this.timingHash();
  }

  async signUp(input: SignUpInput): Promise<SessionResult> {
    const emailNormalized = normalizeEmail(input.email);
    if (await this.repository.findByEmail(emailNormalized)) throw new ConflictException('Email ini sudah terdaftar. Masuk dengan email tersebut.');
    const now = this.clock.now();
    let user: UserRow;
    try {
      user = await this.repository.insertUser({
        email: input.email,
        emailNormalized,
        displayName: input.name,
        passwordHash: await hashPassword(input.password),
        lastSignInAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // Pendaftaran bersamaan dengan email yang sama.
      if (isUniqueViolation(error, 'users_email_unique')) throw new ConflictException('Email ini sudah terdaftar. Masuk dengan email tersebut.');
      throw error;
    }
    return this.startSession(user, now);
  }

  async signIn(input: SignInInput): Promise<SessionResult> {
    const user = await this.repository.findByEmail(normalizeEmail(input.email));
    const now = this.clock.now();
    if (!user) {
      await verifyPassword(input.password, await this.timingHash());
      throw new UnauthorizedException(INVALID);
    }
    if (user.lockedUntil && user.lockedUntil > now) throw new TooManyAttemptsException(Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000));
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      const failed = user.failedSignIns + 1;
      const locked = failed >= MAX_FAILED_SIGN_INS;
      await this.repository.updateUser(user.id, { failedSignIns: locked ? 0 : failed, lockedUntil: locked ? new Date(now.getTime() + LOCK_MS) : null });
      if (locked) throw new TooManyAttemptsException(LOCK_MS / 1000);
      throw new UnauthorizedException(INVALID);
    }
    await this.repository.updateUser(user.id, {
      failedSignIns: 0,
      lockedUntil: null,
      lastSignInAt: now,
      // Hash lama yang lebih lemah diperbarui selagi kata sandinya diketahui.
      ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(input.password), updatedAt: now } : {}),
    });
    return this.startSession(user, now);
  }

  /** Pengguna dari token sesi; `null` bila tidak ada, dicabut, atau kedaluwarsa. */
  async current(token: string | null): Promise<AuthResponse | null> {
    if (!token) return null;
    const now = this.clock.now();
    const found = await this.repository.activeSession(hashSessionToken(token), now);
    if (!found) return null;
    if (now.getTime() - found.session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) await this.repository.touchSession(found.session.id, now);
    return { user: toAccountView(found.user), session: { expiresAt: found.session.expiresAt.toISOString() } };
  }

  private async startSession(user: UserRow, now: Date): Promise<SessionResult> {
    const token = newSessionToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.repository.insertSession({ userId: user.id, tokenHash: hashSessionToken(token), createdAt: now, lastSeenAt: now, expiresAt });
    return { token, user: toAccountView(user), session: { expiresAt: expiresAt.toISOString() } };
  }

  /** Hash pengganti untuk email tak dikenal, dibuat sekali. */
  private timingHash(): Promise<string> {
    this.dummyHash ??= hashPassword(newSessionToken());
    return this.dummyHash;
  }
}
