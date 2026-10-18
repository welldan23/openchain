/**
 * Token dan cookie sesi. Token acak 256 bit hanya dipegang browser lewat
 * cookie HttpOnly; database menyimpan hash SHA-256-nya.
 */
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'openchain_session';
export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const newSessionToken = () => randomBytes(32).toString('base64url');
export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const isSessionToken = (value: string) => TOKEN_PATTERN.test(value);

/** Ambil token sesi dari header Cookie; nilai yang bukan berbentuk token diabaikan. */
export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1 || part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(index + 1).trim();
    return isSessionToken(value) ? value : null;
  }
  return null;
}

/** Opsi cookie sesi: tidak bisa dibaca JavaScript, hanya dikirim situs sendiri, HTTPS di produksi. */
export function sessionCookieOptions(expiresAt: Date, secure: boolean) {
  return { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', expires: expiresAt };
}
