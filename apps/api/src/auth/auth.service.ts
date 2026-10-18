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
import { AuthRepository, isUniqueViolation, type AccountRow } from './auth.repository.js';
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

export function toAccountView({ user, profile }: AccountRow): AccountView {
  return { id: String(user.id), email: user.email, displayName: profile.displayName, timezone: profile.timezone, createdAt: user.createdAt.toISOString() };
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
    let account: AccountRow;
    try {
      account = await this.repository.insertAccount(
        { email: input.email, emailNormalized, passwordHash: await hashPassword(input.password), lastSignInAt: now, createdAt: now, updatedAt: now },
        { displayName: input.name, updatedAt: now },
      );
    } catch (error) {
      // Pendaftaran bersamaan dengan email yang sama.
      if (isUniqueViolation(error, 'users_email_unique')) throw new ConflictException('Email ini sudah terdaftar. Masuk dengan email tersebut.');
      throw error;
    }
    return this.startSession(account, now);
  }

  async signIn(input: SignInInput): Promise<SessionResult> {
    const account = await this.repository.findByEmail(normalizeEmail(input.email));
    const now = this.clock.now();
    if (!account) {
      await verifyPassword(input.password, await this.timingHash());
      throw new UnauthorizedException(INVALID);
    }
    const { user } = account;
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
    return this.startSession(account, now);
  }

  /** Pengguna dari token sesi; `null` bila tidak ada, dicabut, atau kedaluwarsa. */
  async current(token: string | null): Promise<AuthResponse | null> {
    if (!token) return null;
    const now = this.clock.now();
    const found = await this.repository.activeSession(hashSessionToken(token), now);
    if (!found) return null;
    if (now.getTime() - found.session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) await this.repository.touchSession(found.session.id, now);
    return { user: toAccountView(found), session: { expiresAt: found.session.expiresAt.toISOString() } };
  }

  /** Cabut sesi dari token ini; tanpa token atau sesi tidak dikenal tidak melakukan apa-apa. */
  async signOut(token: string | null): Promise<void> {
    if (token) await this.repository.revokeSession(hashSessionToken(token), this.clock.now());
  }

  /** Keluar dari semua perangkat. */
  async signOutEverywhere(userId: number): Promise<number> {
    return this.repository.revokeAllSessions(userId, this.clock.now());
  }

  private async startSession(account: AccountRow, now: Date): Promise<SessionResult> {
    const token = newSessionToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.repository.insertSession({ userId: account.user.id, tokenHash: hashSessionToken(token), createdAt: now, lastSeenAt: now, expiresAt });
    return { token, user: toAccountView(account), session: { expiresAt: expiresAt.toISOString() } };
  }

  /** Hash pengganti untuk email tak dikenal, dibuat sekali. */
  private timingHash(): Promise<string> {
    this.dummyHash ??= hashPassword(newSessionToken());
    return this.dummyHash;
  }
}
