/**
 * Hash kata sandi dengan scrypt bawaan Node (tanpa dependency tambahan).
 * Format tersimpan: `scrypt$N$r$p$garam$hash`, garam dan hash base64url.
 * Kata sandi mentah tidak pernah disimpan, dicetak, atau dicatat.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (password: string, salt: Buffer, length: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, length, options, (error, key) => (error ? reject(error) : resolve(key))));

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** 2^15 iterasi, blok 8: sekitar 32 MiB memori per hash. */
export const DEFAULT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** Batas parameter yang mau diverifikasi, supaya hash tersimpan yang aneh tidak bisa menghabiskan memori server. */
const MAX_N = 2 ** 17;
const MAX_R = 16;
const MAX_P = 4;

const maxmem = (params: ScryptParams) => 256 * params.N * params.r + 1024 * 1024;

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { ...params, maxmem: maxmem(params) });
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

function parse(stored: string): { params: ScryptParams; salt: Buffer; key: Buffer } | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every(Number.isSafeInteger) || N < 2 || (N & (N - 1)) !== 0 || N > MAX_N || r < 1 || r > MAX_R || p < 1 || p > MAX_P) return null;
  const salt = Buffer.from(parts[4], 'base64url');
  const key = Buffer.from(parts[5], 'base64url');
  if (salt.length < 8 || key.length < 16) return null;
  return { params: { N, r, p }, salt, key };
}

/** Cocokkan kata sandi dengan hash tersimpan; perbandingan waktu-konstan. Hash rusak dianggap tidak cocok. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await scrypt(password.normalize('NFKC'), parsed.salt, parsed.key.length, { ...parsed.params, maxmem: maxmem(parsed.params) });
  return timingSafeEqual(key, parsed.key);
}

/** Hash memakai parameter lebih lemah dari sekarang: hash ulang saat pengguna berhasil masuk. */
export function needsRehash(stored: string, params: ScryptParams = DEFAULT_PARAMS): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.params.N < params.N || parsed.params.r < params.r || parsed.params.p < params.p;
}
