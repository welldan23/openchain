/**
 * Validasi daftar dan masuk, sama dengan aturan form frontend. Kata sandi
 * tidak dipotong atau diubah; yang terlalu panjang ditolak sebelum di-hash
 * supaya input raksasa tidak membebani server.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class AuthInputError extends Error {}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new AuthInputError('Isi permintaan harus objek JSON.');
  return value as Record<string, unknown>;
}

function email(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new AuthInputError('Email wajib diisi.');
  const trimmed = value.trim();
  if (trimmed.length > EMAIL_MAX) throw new AuthInputError(`Email maksimal ${EMAIL_MAX} karakter.`);
  if (!EMAIL.test(trimmed)) throw new AuthInputError('Format email belum benar, contoh: nama@domain.com.');
  return trimmed;
}

function password(value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new AuthInputError('Kata sandi wajib diisi.');
  if (value.length > PASSWORD_MAX) throw new AuthInputError(`Kata sandi maksimal ${PASSWORD_MAX} karakter.`);
  return value;
}

export function parseSignUp(value: unknown): SignUpInput {
  const body = record(value);
  if (typeof body.name !== 'string' || body.name.trim() === '') throw new AuthInputError('Nama wajib diisi.');
  const name = body.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) throw new AuthInputError(`Nama ${NAME_MIN}–${NAME_MAX} karakter.`);
  const parsedEmail = email(body.email);
  const parsedPassword = password(body.password);
  if (parsedPassword.length < PASSWORD_MIN || !/\p{L}/u.test(parsedPassword) || !/\d/.test(parsedPassword)) {
    throw new AuthInputError(`Kata sandi minimal ${PASSWORD_MIN} karakter dan berisi huruf serta angka.`);
  }
  if (normalizeEmail(parsedPassword) === normalizeEmail(parsedEmail)) throw new AuthInputError('Kata sandi tidak boleh sama dengan email.');
  return { name, email: parsedEmail, password: parsedPassword };
}

export function parseSignIn(value: unknown): SignInInput {
  const body = record(value);
  return { email: email(body.email), password: password(body.password) };
}
